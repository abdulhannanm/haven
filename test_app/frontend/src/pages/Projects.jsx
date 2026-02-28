import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Form } from 'react-bootstrap';
import api from '../services/api';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    category: 'Environment',
    goal: '',
    progress: 0,
    location: ''
  });
  
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get("/projects");
        setProjects(res.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching projects: ', error);
        setLoading(false);
      }
    };
    
    fetchProjects();
  }, []);

  const categories = [
    'All', 'Environment', 'Education', 'Food Security', 
    'Health', 'Technology', 'Community Development'
  ];

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || project.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handleCreateProject = async (event) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!newProject.title || !newProject.description || !newProject.location || !newProject.goal) {
      setFormError('Please fill in the required fields.');
      return;
    }

    const goalValue = Number(newProject.goal);
    if (Number.isNaN(goalValue) || goalValue <= 0) {
      setFormError('Goal must be a positive number.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...newProject,
        goal: goalValue,
        progress: Number(newProject.progress) || 0
      };
      const res = await api.post('/projects', payload);
      setProjects((prev) => [res.data, ...prev]);
      setNewProject({
        title: '',
        description: '',
        category: 'Environment',
        goal: '',
        progress: 0,
        location: ''
      });
      setFormSuccess('Project created successfully.');
    } catch (error) {
      console.error('Error creating project: ', error);
      setFormError('Could not create project. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container className="py-4">
      <div className="text-center mb-5">
        <h1 className="display-4 fw-bold mb-4">
          Community Projects
        </h1>
        <p className="lead text-muted">
          Browse and support initiatives making a real difference in communities worldwide
        </p>
      </div>
      
      <div className="mb-4">
        <Row className="g-3 align-items-center">
          <Col md={6}>
            <Form.Control
              type="search"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="me-2"
            />
          </Col>
          
          <Col md={4}>
            <Form.Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Form.Select>
          </Col>
          
          <Col md={2}>
            <Button variant="outline-primary" size="sm" disabled={loading}>
              {loading ? 'Loading...' : 'Filter'}
            </Button>
          </Col>
        </Row>
      </div>

      <Card className="mb-5 border-0 shadow-sm bg-soft">
        <Card.Body>
          <Card.Title className="fw-bold mb-3">Start a New Project</Card.Title>
          <Form onSubmit={handleCreateProject}>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label>Title *</Form.Label>
                <Form.Control
                  value={newProject.title}
                  onChange={(event) => setNewProject({ ...newProject, title: event.target.value })}
                  placeholder="Project title"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Location *</Form.Label>
                <Form.Control
                  value={newProject.location}
                  onChange={(event) => setNewProject({ ...newProject, location: event.target.value })}
                  placeholder="City or region"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Category</Form.Label>
                <Form.Select
                  value={newProject.category}
                  onChange={(event) => setNewProject({ ...newProject, category: event.target.value })}
                >
                  {categories.filter((category) => category !== 'All').map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={3}>
                <Form.Label>Goal (USD) *</Form.Label>
                <Form.Control
                  type="number"
                  min="1"
                  step="1"
                  value={newProject.goal}
                  onChange={(event) => setNewProject({ ...newProject, goal: event.target.value })}
                  placeholder="5000"
                />
              </Col>
              <Col md={3}>
                <Form.Label>Initial Progress (%)</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={newProject.progress}
                  onChange={(event) => setNewProject({ ...newProject, progress: event.target.value })}
                />
              </Col>
              <Col md={12}>
                <Form.Label>Description *</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={newProject.description}
                  onChange={(event) => setNewProject({ ...newProject, description: event.target.value })}
                  placeholder="Tell people what you are building and why it matters."
                />
              </Col>
            </Row>
            <div className="d-flex flex-column flex-md-row align-items-md-center gap-3 mt-4">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Create Project'}
              </Button>
              {formError && <span className="text-danger">{formError}</span>}
              {formSuccess && <span className="text-success">{formSuccess}</span>}
            </div>
          </Form>
        </Card.Body>
      </Card>
      
      <Row className="g-4">
        {loading ? (
          <Col className="text-center">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </Col>
        ) : filteredProjects.length === 0 ? (
          <Col className="text-center">
            <p className="lead text-muted">
              No projects found matching your criteria.
            </p>
          </Col>
        ) : (
          filteredProjects.map((project) => (
            <Col md={4} key={project.id}>
              <Card className="h-100">
                <Card.Body>
                  <Card.Title className="h5 fw-bold">
                    {project.title}
                  </Card.Title>
                  <Card.Subtitle className="mb-2 text-muted">
                    {project.category}
                  </Card.Subtitle>
                  <Card.Text className="text-muted mb-3">
                    {project.description.substring(0, 120)}...
                  </Card.Text>
                  
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="text-muted">Goal: {formatCurrency(project.goal)}</span>
                      <span className="fw-bold">
                        {project.progress.toFixed(1)}% Funded
                      </span>
                    </div>
                    <div className="progress mt-2" style={{ height: '2px' }}>
                      <div
                        className="progress-bar bg-success"
                        role="progressbar"
                        style={{ width: `${project.progress}%` }}
                      >
                      </div>
                    </div>
                  </div>
                  
                  <div className="d-flex justify-content-between">
                    <span className="text-muted">{project.location}</span>
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      href={`/projects/${project.id}`}
                    >
                      View Details
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))
        )}
      </Row>
      
      {filteredProjects.length > 0 && (
        <div className="text-center mt-4">
          <Button variant="outline-primary" size="lg" href="/projects">
            View All Projects
          </Button>
        </div>
      )}
    </Container>
  );
};

export default Projects;
