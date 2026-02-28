import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Form, Button, ListGroup } from 'react-bootstrap';
import api from '../services/api';

const Volunteers = () => {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [form, setForm] = useState({
    name: '',
    email: '',
    skills: '',
    availability: ''
  });

  const loadVolunteers = async () => {
    try {
      const res = await api.get('/volunteers');
      setVolunteers(res.data);
    } catch (error) {
      console.error('Error fetching volunteers: ', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVolunteers();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage({ type: '', text: '' });

    if (!form.name || !form.email || !form.skills || !form.availability) {
      setMessage({ type: 'danger', text: 'Please complete all fields.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...form,
        skills: form.skills.split(',').map((skill) => skill.trim()).filter(Boolean)
      };
      await api.post('/volunteers', payload);
      setForm({ name: '', email: '', skills: '', availability: '' });
      setMessage({ type: 'success', text: 'Thank you for signing up to volunteer.' });
      await loadVolunteers();
    } catch (error) {
      console.error('Error submitting volunteer: ', error);
      setMessage({ type: 'danger', text: 'Could not submit your application.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container className="py-4">
      <div className="text-center mb-5">
        <h1 className="display-5 fw-bold">Volunteer</h1>
        <p className="text-muted">Offer your skills to support a project.</p>
      </div>

      <Row className="g-4">
        <Col lg={5}>
          <Card className="border-0 shadow-sm bg-soft">
            <Card.Body>
              <Card.Title className="fw-bold">Join the Volunteer Network</Card.Title>
              <Form className="mt-3" onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Name *</Form.Label>
                  <Form.Control
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Full name"
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Email *</Form.Label>
                  <Form.Control
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="name@example.com"
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Skills (comma separated) *</Form.Label>
                  <Form.Control
                    value={form.skills}
                    onChange={(event) => setForm({ ...form, skills: event.target.value })}
                    placeholder="Fundraising, Mentoring, Design"
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Availability *</Form.Label>
                  <Form.Control
                    value={form.availability}
                    onChange={(event) => setForm({ ...form, availability: event.target.value })}
                    placeholder="Weekends, Evenings, Remote"
                  />
                </Form.Group>
                <Button type="submit" variant="success" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Join'}
                </Button>
                {message.text && (
                  <div className={`mt-3 text-${message.type}`}>{message.text}</div>
                )}
              </Form>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="fw-bold">Volunteer Community</Card.Title>
              {loading ? (
                <div className="py-4 text-center">Loading volunteers...</div>
              ) : volunteers.length === 0 ? (
                <div className="py-4 text-center text-muted">No volunteers yet.</div>
              ) : (
                <ListGroup variant="flush" className="mt-3">
                  {volunteers.map((volunteer) => (
                    <ListGroup.Item key={volunteer.id}>
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="fw-bold">{volunteer.name}</div>
                          <div className="text-muted">{volunteer.email}</div>
                          <div className="text-muted">
                            Skills: {volunteer.skills.join(', ')}
                          </div>
                        </div>
                        <span className="badge-soft">{volunteer.availability}</span>
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Volunteers;
