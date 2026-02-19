from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from bson import ObjectId

# --- CONFIGURATION ---
SECRET_KEY = "WAREHOUSE_SECRET_123" 
ALGORITHM = "HS256"
MONGO_DETAILS = "mongodb+srv://sswaraj1407_db_user:yW7n0t0JZcvPI4JJ@dbms.arqxlvx.mongodb.net/"

app = FastAPI()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Enable React to talk to Python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_DETAILS)
db = client.inventory_system

# --- MODELS ---
class UserCreate(BaseModel):
    username: str
    password: str
    role: str

class Item(BaseModel):
    name: str
    quantity: int


class UpdateItem(BaseModel):
    name: str
    quantity: int
    reason: Optional[str] = None

# --- HELPERS ---
def hash_pass(password): return pwd_context.hash(password)
def verify_pass(plain, hashed): return pwd_context.verify(plain, hashed)

async def verify_token(token: str = Depends(oauth2_scheme)):
    """Decode and validate the JWT token, return the payload"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        role = payload.get("role")
        if not username or not role:
            raise HTTPException(status_code=401, detail="Invalid token structure")
        return {"username": username, "role": role, "token": token}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# --- ROUTES ---
@app.post("/signup")
async def signup(user: UserCreate):
    # Check if user already exists
    existing_user = await db.users.find_one({"username": user.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Generate persistent token
    token = jwt.encode({"sub": user.username, "role": user.role}, SECRET_KEY, algorithm=ALGORITHM)
    
    # Store user with token
    await db.users.insert_one({
        "username": user.username, 
        "password": user.password,
        "role": user.role,
        "token": token
    })
    return {"message": "User created", "access_token": token, "token_type": "bearer"}

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await db.users.find_one({"username": form_data.username})
    
    # Verify credentials
    if not user or form_data.password != user["password"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Return the persistent token stored in database
    token = user.get("token")
    if not token:
        # Fallback: if old user doesn't have token, create one
        token = jwt.encode({"sub": user["username"], "role": user["role"]}, SECRET_KEY, algorithm=ALGORITHM)
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"token": token}})
    
    return {"access_token": token, "token_type": "bearer"}

@app.get("/items")
async def get_items(user_data: dict = Depends(verify_token)):
    """Get all items - requires valid token"""
    cursor = db.items.find({})
    items = []
    async for doc in cursor:
        items.append({"id": str(doc["_id"]), "name": doc["name"], "quantity": doc["quantity"]})
    return items

@app.post("/add-item")
async def add_item(item: Item, user_data: dict = Depends(verify_token)):
    """Add new item - only owners can add items"""
    # Only owners can add items
    if user_data["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can add items")
    
    new_item = await db.items.insert_one(item.dict())
    return {"message": "Item added!", "id": str(new_item.inserted_id)}

@app.delete("/items/{item_id}")
async def delete_item(item_id: str, user_data: dict = Depends(verify_token)):
    """Delete item - only owners can delete items"""
    # Only owners can delete items
    if user_data["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can delete items")
    
    await db.items.delete_one({"_id": ObjectId(item_id)})
    return {"message": "Deleted"}

@app.put("/items/{item_id}")
async def update_item(item_id: str, item: UpdateItem, user_data: dict = Depends(verify_token)):
    """Update item quantity - owners and employees can update. Record adjustment with reason."""
    # Both owners and employees can update quantities
    if user_data["role"] not in ["owner", "employee"]:
        raise HTTPException(status_code=403, detail="Only owners and employees can update items")

    # Fetch existing item to compute delta
    existing = await db.items.find_one({"_id": ObjectId(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")

    old_qty = existing.get("quantity", 0)
    new_qty = item.quantity
    delta = new_qty - old_qty

    # Validate reason only when quantity actually changes (delta != 0)
    allowed_reasons = {"supplier delivery", "goods moved", "goods moved out of warehouse", "damaged goods"}
    if delta != 0:
        if not item.reason or item.reason not in allowed_reasons:
            raise HTTPException(status_code=400, detail=f"Invalid or missing reason. Allowed: {', '.join(sorted(allowed_reasons))}")

        # Enforce reason sign: increases must be 'supplier delivery'; decreases must not be 'supplier delivery'
        if delta > 0 and item.reason != "supplier delivery":
            raise HTTPException(status_code=400, detail="Positive quantity changes must use reason 'supplier delivery'.")
        if delta < 0 and item.reason == "supplier delivery":
            raise HTTPException(status_code=400, detail="Decreasing quantity cannot use reason 'supplier delivery'.")
    else:
        # name-only change: reason optional; normalize for audit
        if not item.reason:
            item.reason = "name changed"

    # Update item
    result = await db.items.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {"name": item.name, "quantity": new_qty}}
    )

    # Record adjustment in a separate collection for audit
    adjustment = {
        "item_id": str(item_id),
        "item_name": item.name,
        "changed_by": user_data.get("username"),
        "role": user_data.get("role"),
        "delta": delta,
        "reason": item.reason,
        "timestamp": datetime.utcnow()
    }
    await db.adjustments.insert_one(adjustment)

    return {"message": "Item updated successfully", "delta": delta}


@app.get("/adjustments")
async def get_adjustments(limit: int = 50, user_data: dict = Depends(verify_token)):
    """Return recent adjustments (owner-only). Sorted by newest first."""
    # Only owners can view adjustments
    if user_data.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can view adjustments")

    cursor = db.adjustments.find({}).sort("timestamp", -1).limit(int(limit))
    results = []
    async for doc in cursor:
        results.append({
            "id": str(doc.get("_id")),
            "item_id": doc.get("item_id"),
            "item_name": doc.get("item_name"),
            "changed_by": doc.get("changed_by"),
            "role": doc.get("role"),
            "delta": doc.get("delta"),
            "reason": doc.get("reason"),
            "timestamp": str(doc.get("timestamp"))
        })
    return results

@app.on_event("startup")
async def startup_db_client():
    try:
        # The 'ping' command checks if the server is reachable and credentials are valid
        await client.admin.command('ping')
        print("✅ SUCCESS: Connected to MongoDB Atlas!")
    except Exception as e:
        print(f"❌ ERROR: Could not connect to MongoDB. Reason: {e}")