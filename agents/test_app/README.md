# Hack4Humanity

A FastAPI and React application for social impact projects and community involvement.

## Features

- **FastAPI Backend**: RESTful API with 5 main routes
- **React Frontend**: Modern, responsive UI with Bootstrap
- **Project Management**: Create, view, and manage social impact projects
- **Donation System**: Secure donation processing
- **Volunteer Management**: Track volunteer applications and skills
- **Real-time Statistics**: Live project progress and platform metrics
- **OpenAPI Documentation**: Comprehensive API documentation

## Quick Start

### Prerequisites

- Python 3.7+
- Node.js 16+
- pip
- npm

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd test_app
```

2. Install dependencies:
```bash
make install
```

3. Start the application:
```bash
make run
```

This will start:
- FastAPI backend on http://localhost:8000
- React frontend on http://localhost:3000

## API Routes

### Backend (FastAPI)

- `GET /` - Welcome message and API info
- `GET /projects` - List all projects
- `GET /projects/{id}` - Get specific project
- `POST /projects` - Create new project
- `GET /donations` - List all donations
- `POST /donations` - Create new donation
- `GET /volunteers` - List all volunteers
- `POST /volunteers` - Create new volunteer
- `GET /stats` - Platform statistics

### Frontend (React)

- `/` - Home page with statistics and featured projects
- `/projects` - Browse all projects
- `/projects/{id}` - Project details and donation form
- `/donations` - View all donations
- `/volunteers` - View all volunteers
- `/stats` - Platform statistics

## Development

### Using Makefile

- `make install` - Install all dependencies
- `make backend` - Start backend only
- `make frontend` - Start frontend only
- `make run` - Start both backend and frontend
- `make dev` - Development mode (backend + frontend)
- `make clean` - Clean up build artifacts

### Manual Start

Backend:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:
```bash
cd frontend
npm install
npm start
```

## Project Structure

```
test_app/
├── backend/
│   ├── main.py              # FastAPI application
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── package.json         # Node.js dependencies
│   ├── public/
│   │   └── index.html       # HTML template
│   └── src/
│       ├── App.js           # Main React component
│       ├── App.css          # Styles
│       ├── components/      # Reusable components
│       └── pages/          # Page components
├── Makefile                # Build and run commands
└── README.md              # This file
```

## Technology Stack

- **Backend**: FastAPI, Python, Pydantic
- **Frontend**: React, React Router, Bootstrap, Axios
- **Database**: In-memory (for demo purposes)
- **API Documentation**: Automatic OpenAPI/Swagger UI
- **Styling**: Bootstrap 5 with custom CSS

## API Documentation

The FastAPI backend automatically generates OpenAPI/Swagger documentation accessible at:

- http://localhost:8000/docs - Swagger UI
- http://localhost:8000/redoc - ReDoc documentation

## Security Notes

- This is a demo application with in-memory storage
- No authentication or authorization implemented
- For production use, add proper security measures
- Consider using a real database for data persistence

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support or questions, please contact the development team.