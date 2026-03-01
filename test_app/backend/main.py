from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import json
import logging
import time

app = FastAPI(
    title="Hack4Humanity API",
    description="API for Hack4Humanity initiative",
    version="1.0.0",
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("hack4humanity")

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    logger.info(
        "%s %s %s %.2fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# Models
class ProjectBase(BaseModel):
    title: str
    description: str
    category: str
    goal: float
    progress: float
    location: str


class ProjectCreate(ProjectBase):
    metadata: Optional[dict] = None


class Project(ProjectBase):
    id: int
    created_at: str


class DonationBase(BaseModel):
    project_id: int
    amount: float
    donor_name: str
    message: Optional[str] = None


class DonationCreate(DonationBase):
    metadata: Optional[dict] = None


class Donation(DonationBase):
    id: int
    created_at: str


class VolunteerBase(BaseModel):
    name: str
    email: str
    skills: List[str]
    availability: str


class VolunteerCreate(VolunteerBase):
    metadata: Optional[dict] = None


class Volunteer(VolunteerBase):
    id: int
    created_at: str


# In-memory data storage
projects_db = []
donations_db = []
volunteers_db = []


# Helper functions
def get_project_by_id(project_id: int):
    for project in projects_db:
        if project["id"] == project_id:
            return project
    return None


# Routes
@app.get("/")
async def root():
    """Welcome endpoint"""
    return {
        "message": "Welcome to Hack4Humanity API",
        "description": "A platform for social impact projects and community involvement",
        "endpoints": [
            "/projects",
            "/projects/{id}",
            "/donations",
            "/volunteers",
            "/stats",
        ],
    }


@app.get("/projects", response_model=List[Project])
async def get_projects():
    """Get all projects"""
    return projects_db


@app.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: int):
    """Get a specific project"""
    project = get_project_by_id(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.post("/projects", response_model=Project)
async def create_project(project: ProjectCreate):
    """Create a new project"""
    new_id = max([p["id"] for p in projects_db], default=0) + 1
    project_data = project.dict()
    project_data.update(
        {
            "id": new_id,
            "created_at": "2026-02-28T00:00:00Z",
            "progress": min(project_data.get("progress", 0), 100),
        }
    )
    projects_db.append(project_data)
    return project_data


@app.post("/ingest")
async def ingest_payload(payload: dict):
    """Accept arbitrary JSON for load testing."""
    payload_bytes = len(json.dumps(payload).encode("utf-8"))
    return {"received_bytes": payload_bytes}


@app.get("/donations", response_model=List[Donation])
async def get_donations():
    """Get all donations"""
    return donations_db


@app.post("/donations", response_model=Donation)
async def create_donation(donation: DonationCreate):
    """Create a new donation"""
    new_id = max([d["id"] for d in donations_db], default=0) + 1
    donation_data = donation.dict()
    donation_data.update({"id": new_id, "created_at": "2026-02-28T00:00:00Z"})
    donations_db.append(donation_data)

    # Update project progress
    project = get_project_by_id(donation_data["project_id"])
    if project:
        project["progress"] = min(
            project["progress"] + (donation_data["amount"] / project["goal"] * 100), 100
        )

    return donation_data


@app.get("/volunteers", response_model=List[Volunteer])
async def get_volunteers():
    """Get all volunteers"""
    return volunteers_db


@app.post("/volunteers", response_model=Volunteer)
async def create_volunteer(volunteer: VolunteerCreate):
    """Create a new volunteer"""
    new_id = max([v["id"] for v in volunteers_db], default=0) + 1
    volunteer_data = volunteer.dict()
    volunteer_data.update({"id": new_id, "created_at": "2026-02-28T00:00:00Z"})
    volunteers_db.append(volunteer_data)
    return volunteer_data


@app.get("/stats")
async def get_stats():
    """Get platform statistics"""
    total_projects = len(projects_db)
    total_donations = len(donations_db)
    total_volunteers = len(volunteers_db)
    total_amount_raised = sum([d["amount"] for d in donations_db])

    return {
        "total_projects": total_projects,
        "total_donations": total_donations,
        "total_volunteers": total_volunteers,
        "total_amount_raised": total_amount_raised,
        "active_projects": len([p for p in projects_db if p["progress"] < 100]),
        "completed_projects": len([p for p in projects_db if p["progress"] >= 100]),
    }


if __name__ == "__main__":
    # Add some sample data
    if not projects_db:
        projects_db.extend(
            [
                {
                    "id": 1,
                    "title": "Clean Water Initiative",
                    "description": "Providing clean drinking water to rural communities in developing countries",
                    "category": "Environment",
                    "goal": 50000.0,
                    "progress": 45.2,
                    "location": "Sub-Saharan Africa",
                    "created_at": "2026-02-01T00:00:00Z",
                },
                {
                    "id": 2,
                    "title": "Digital Literacy Program",
                    "description": "Teaching computer skills to underprivileged youth",
                    "category": "Education",
                    "goal": 15000.0,
                    "progress": 78.5,
                    "location": "Urban Areas",
                    "created_at": "2026-02-05T00:00:00Z",
                },
                {
                    "id": 3,
                    "title": "Food Security Project",
                    "description": "Establishing community gardens and food distribution centers",
                    "category": "Food Security",
                    "goal": 25000.0,
                    "progress": 23.1,
                    "location": "North America",
                    "created_at": "2026-02-10T00:00:00Z",
                },
            ]
        )

    if not donations_db:
        donations_db.extend(
            [
                {
                    "id": 1,
                    "project_id": 1,
                    "amount": 500.0,
                    "donor_name": "John Doe",
                    "message": "Making a difference!",
                    "created_at": "2026-02-15T00:00:00Z",
                },
                {
                    "id": 2,
                    "project_id": 2,
                    "amount": 200.0,
                    "donor_name": "Jane Smith",
                    "message": "Supporting education",
                    "created_at": "2026-02-18T00:00:00Z",
                },
            ]
        )

    if not volunteers_db:
        volunteers_db.extend(
            [
                {
                    "id": 1,
                    "name": "Mike Johnson",
                    "email": "mike@example.com",
                    "skills": ["Teaching", "IT Support"],
                    "availability": "Weekends",
                    "created_at": "2026-02-12T00:00:00Z",
                },
                {
                    "id": 2,
                    "name": "Sarah Wilson",
                    "email": "sarah@example.com",
                    "skills": ["Gardening", "Community Outreach"],
                    "availability": "Weekdays",
                    "created_at": "2026-02-14T00:00:00Z",
                },
            ]
        )

    uvicorn.run(app, host="0.0.0.0", port=8000)
