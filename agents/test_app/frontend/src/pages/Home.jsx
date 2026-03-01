import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import api from '../services/api';

const Home = () => {
  const [stats, setStats] = useState(null);
  const [featuredProjects, setFeaturedProjects] = useState([]);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, projectsRes] = await Promise.all([
          api.get("/stats"),
          api.get("/projects")
        ]);
        
        setStats(statsRes.data);
        setFeaturedProjects(projectsRes.data.slice(0, 3));
      } catch (error) {
        console.error('Error fetching data: ', error);
      }
    };
    
    fetchData();
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <Container className="py-4">
      <div className="text-center mb-5">
        <h1 className="display-4 fw-bold mb-4">
          Hack4Humanity
        </h1>
        <h2 className="text-muted mb-4">
          Connecting Communities with Impact
        </h2>
        <Button variant="primary" size="lg" href="/projects">
          Explore Projects
        </Button>
      </div>
      
      {stats && (
        <div className="mb-5">
          <Row className="g-4">
            <Col md={3}>
              <Card className="text-center h-100 border-0 shadow-sm">
                <Card.Body>
                  <Card.Title className="display-4 fw-bold text-primary">
                    {stats.total_projects}
                  </Card.Title>
                  <Card.Text className="text-muted">
                    Total Projects
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={3}>
              <Card className="text-center h-100 border-0 shadow-sm">
                <Card.Body>
                  <Card.Title className="display-4 fw-bold text-success">
                    {formatCurrency(stats.total_amount_raised)}
                  </Card.Title>
                  <Card.Text className="text-muted">
                    Donated
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={3}>
              <Card className="text-center h-100 border-0 shadow-sm">
                <Card.Body>
                  <Card.Title className="display-4 fw-bold text-info">
                    {stats.total_volunteers}
                  </Card.Title>
                  <Card.Text className="text-muted">
                    Volunteers
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={3}>
              <Card className="text-center h-100 border-0 shadow-sm">
                <Card.Body>
                  <Card.Title className="display-4 fw-bold text-warning">
                    {stats.active_projects}
                  </Card.Title>
                  <Card.Text className="text-muted">
                    Active Projects
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>
      )}
      
      <div className="text-center mb-5">
        <h2 className="display-5 fw-bold mb-4">
          Featured Projects
        </h2>
        <Button variant="outline-primary" size="sm" href="/projects">
          View All Projects
        </Button>
      </div>
      
      <Row className="g-4">
        {featuredProjects.map((project) => (
          <Col md={4} key={project.id}>
            <Card className="h-100">
              <Card.Body>
                <Card.Title className="h5 fw-bold">
                  {project.title}
                </Card.Title>
                <Card.Text className="text-muted mb-2">
                  {project.description.substring(0, 100)}...
                </Card.Text>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-muted">
                    {project.category}
                  </span>
                  <Button 
                    variant="outline-primary" 
                    size="sm" 
                    href={`/projects/${project.id}`}
                  >
                    Learn More
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      
      <div className="text-center mt-5 pt-5 border-top">
        <h2 className="display-5 fw-bold mb-4">
          Make a Difference Today
        </h2>
        <Row className="g-4">
          <Col md={4}>
            <Card className="h-100 border-0 shadow-sm">
              <Card.Body className="text-center">
                <div className="mb-3">
                  <i className="fas fa-hand-holding-heart fa-3x text-primary"></i>
                </div>
                <h4 className="fw-bold">Donate</h4>
                <p className="text-muted">
                  Support projects that matter to you
                </p>
                <Button variant="primary" href="/donations">Donate Now</Button>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={4}>
            <Card className="h-100 border-0 shadow-sm">
              <Card.Body className="text-center">
                <div className="mb-3">
                  <i className="fas fa-users fa-3x text-success"></i>
                </div>
                <h4 className="fw-bold">Volunteer</h4>
                <p className="text-muted">
                  Give your time and skills
                </p>
                <Button variant="success" href="/volunteers">Volunteer</Button>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={4}>
            <Card className="h-100 border-0 shadow-sm">
              <Card.Body className="text-center">
                <div className="mb-3">
                  <i className="fas fa-project-diagram fa-3x text-info"></i>
                </div>
                <h4 className="fw-bold">Start Project</h4>
                <p className="text-muted">
                  Launch your own initiative
                </p>
                <Button variant="info" href="/projects">Start Now</Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>
    </Container>
  );
};

export default Home;
