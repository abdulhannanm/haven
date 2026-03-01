import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import api from '../services/api';

const Stats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await api.get('/stats');
        setStats(res.data);
      } catch (error) {
        console.error('Error fetching stats: ', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <div className="spinner-border" role="status" />
      </Container>
    );
  }

  if (!stats) {
    return (
      <Container className="py-5 text-center">
        <h2 className="fw-bold">No stats available</h2>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <div className="text-center mb-5">
        <h1 className="display-5 fw-bold">Impact Snapshot</h1>
        <p className="text-muted">Real-time totals from the Hack4Humanity community.</p>
      </div>

      <Row className="g-4">
        <Col md={4}>
          <Card className="text-center h-100 border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="display-6 fw-bold text-primary">
                {stats.total_projects}
              </Card.Title>
              <Card.Text className="text-muted">Total Projects</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="text-center h-100 border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="display-6 fw-bold text-success">
                ${stats.total_amount_raised.toLocaleString()}
              </Card.Title>
              <Card.Text className="text-muted">Total Raised</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="text-center h-100 border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="display-6 fw-bold text-warning">
                {stats.total_volunteers}
              </Card.Title>
              <Card.Text className="text-muted">Volunteers</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4 mt-2">
        <Col md={4}>
          <Card className="text-center h-100 border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="display-6 fw-bold text-info">
                {stats.total_donations}
              </Card.Title>
              <Card.Text className="text-muted">Donations</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="text-center h-100 border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="display-6 fw-bold text-primary">
                {stats.active_projects}
              </Card.Title>
              <Card.Text className="text-muted">Active Projects</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="text-center h-100 border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="display-6 fw-bold text-success">
                {stats.completed_projects}
              </Card.Title>
              <Card.Text className="text-muted">Completed Projects</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Stats;
