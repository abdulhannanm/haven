# Makefile for Hack4Humanity Application

.PHONY: help install backend frontend run clean

# Default target
help:
	@echo "Hack4Humanity Application"
	@echo ""
	@echo "Available commands:"
	@echo "  make install    - Install all dependencies"
	@echo "  make backend    - Start FastAPI backend server"
	@echo "  make frontend   - Start React frontend server"
	@echo "  make run        - Start both backend and frontend"
	@echo "  make clean      - Clean up build artifacts"

# Install all dependencies
install: install-backend install-frontend

install-backend:
	@echo "Installing backend dependencies..."
	@cd backend && pip install -r requirements.txt

install-frontend:
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install

# Start FastAPI backend server
backend:
	@echo "Starting FastAPI backend server on port 8000..."
	@cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Start React frontend server
frontend:
	@echo "Starting React frontend server on port 3000..."
	@cd frontend && npm run dev

# Start both backend and frontend
run: backend frontend

# Clean up build artifacts
clean:
	@echo "Cleaning up..."
	@cd frontend && npm run clean 2>/dev/null || true
	@find . -name "*.pyc" -delete 2>/dev/null || true
	@find . -name "__pycache__" -delete 2>/dev/null || true
	@rm -rf frontend/node_modules backend/__pycache__ 2>/dev/null || true

# Development mode - runs backend in one terminal and frontend in another
dev:
	@echo "Starting development environment..."
	@echo "Backend will run on http://localhost:8000"
	@echo "Frontend will run on http://localhost:3000"
	@echo ""
	@echo "Press Ctrl+C to stop both servers"
	@echo ""
	@-cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
	@sleep 2
	@cd frontend && npm run dev
