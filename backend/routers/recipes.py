from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.recipe import RecipeCreate, RecipeModel, RecipeUpdate
from models.user import UserPublic
from routers.auth import get_current_user, require_admin

router = APIRouter()


def _to_object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid ID: {id_str}")


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


@router.get("")
async def list_recipes(_: UserPublic = Depends(get_current_user)):
    db = get_db()
    cursor = db.recipes.find({"active": True}).sort("name", 1)
    return [_serialize(doc) async for doc in cursor]


@router.get("/{recipe_id}")
async def get_recipe(recipe_id: str, _: UserPublic = Depends(get_current_user)):
    db = get_db()
    doc = await db.recipes.find_one({"_id": _to_object_id(recipe_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return _serialize(doc)


@router.post("", status_code=201)
async def create_recipe(body: RecipeCreate, _: UserPublic = Depends(require_admin)):
    from datetime import datetime
    db = get_db()
    from models.recipe import RecipeModel
    recipe = RecipeModel(
        name=body.name,
        description=body.description,
        active=body.active,
        steps=body.steps,
    )
    doc = recipe.model_dump(by_alias=True, exclude_none=True)
    result = await db.recipes.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.put("/{recipe_id}")
async def update_recipe(
    recipe_id: str,
    body: RecipeUpdate,
    _: UserPublic = Depends(require_admin),
):
    db = get_db()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "steps" in updates:
        updates["steps"] = [s.model_dump(exclude_none=True) for s in body.steps]
    result = await db.recipes.find_one_and_update(
        {"_id": _to_object_id(recipe_id)},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return _serialize(result)


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(recipe_id: str, _: UserPublic = Depends(require_admin)):
    db = get_db()
    result = await db.recipes.update_one(
        {"_id": _to_object_id(recipe_id)},
        {"$set": {"active": False}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
