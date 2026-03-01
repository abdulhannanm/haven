import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Form } from 'react-bootstrap';
import api from '../services/api';

const ProjectDetail = () => {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [form, setForm] = useState({
    amount: '',
    donor_name: '',
    message: ''
  });

  const loadProject = async () => {
    try {
      const [projectRes, donationsRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get('/donations')
      ]);
      setProject(projectRes.data);
      setDonations(donationsRes.data.filter((donation) => donation.project_id === Number(id)));
    } catch (error) {
      console.error('Error loading project: ', error);
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const handleDonation = async (event) => {
    event.preventDefault();
    setMessage({ type: '', text: '' });

    if (!form.amount || !form.donor_name) {
      setMessage({ type: 'danger', text: 'Please provide your name and donation amount.' });
      return;
    }

    const amountValue = Number(form.amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      setMessage({ type: 'danger', text: 'Amount must be a positive number.' });
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/donations', {
        project_id: Number(id),
        amount: amountValue,
        donor_name: form.donor_name,
        message: form.message
      });
      setForm({ amount: '', donor_name: '', message: '' });
      setMessage({ type: 'success', text: 'Donation submitted. Thank you!' });
      await loadProject();
    } catch (error) {
      console.error('Error submitting donation: ', error);
      setMessage({ type: 'danger', text: 'Could not submit donation.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <div className="spinner-border" role="status" />
      </Container>
    );
  }

  if (!project) {
    return (
      <Container className="py-5 text-center">
        <h2 className="fw-bold">Project not found</h2>
        <Button as={Link} to="/projects" variant="outline-primary" className="mt-3">
          Back to Projects
        </Button>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <Row className="g-4 align-items-start">
        <Col lg={8}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="d-flex flex-wrap justify-content-between gap-3">
                <div>
                  <h1 className="fw-bold">{project.title}</h1>
                  <p className="text-muted">{project.location}</p>
                </div>
                <span className="badge-soft">{project.category}</span>
              </div>
              <p className="mt-3 text-muted">{project.description}</p>
              <div className="mt-4">
                <div className="d-flex justify-content-between">
                  <span className="text-muted">Goal: ${project.goal.toLocaleString()}</span>
                  <span className="fw-bold">{project.progress.toFixed(1)}% funded</span>
                </div>
                <div className="progress mt-2">
                  <div
                    className="progress-bar bg-success"
                    role="progressbar"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
            </Card.Body>
          </Card>

          <Card className="border-0 shadow-sm mt-4">
            <Card.Body>
              <Card.Title className="fw-bold">Latest Donations</Card.Title>
              {donations.length === 0 ? (
                <div className="text-muted mt-3">No donations for this project yet.</div>
              ) : (
                <ul className="list-unstyled mt-3">
                  {donations.slice(0, 5).map((donation) => (
                    <li key={donation.id} className="mb-2">
                      <strong>{donation.donor_name}</strong> donated ${donation.amount.toFixed(2)}
                      {donation.message ? ` — ${donation.message}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="border-0 shadow-sm bg-soft">
            <Card.Body>
              <Card.Title className="fw-bold">Support This Project</Card.Title>
              <Form className="mt-3" onSubmit={handleDonation}>
                <Form.Group className="mb-3">
                  <Form.Label>Amount (USD) *</Form.Label>
                  <Form.Control
                    type="number"
                    min="1"
                    step="1"
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                    placeholder="50"
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Your Name *</Form.Label>
                  <Form.Control
                    value={form.donor_name}
                    onChange={(event) => setForm({ ...form, donor_name: event.target.value })}
                    placeholder="Full name"
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Message</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={form.message}
                    onChange={(event) => setForm({ ...form, message: event.target.value })}
                    placeholder="Optional message"
                  />
                </Form.Group>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Donate'}
                </Button>
                {message.text && (
                  <div className={`mt-3 text-${message.type}`}>{message.text}</div>
                )}
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ProjectDetail;
