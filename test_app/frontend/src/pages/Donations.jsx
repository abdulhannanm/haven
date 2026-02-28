import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Table } from 'react-bootstrap';
import api from '../services/api';

const Donations = () => {
  const [donations, setDonations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [form, setForm] = useState({
    project_id: '',
    amount: '',
    donor_name: '',
    message: ''
  });

  const loadData = async () => {
    try {
      const [donationsRes, projectsRes] = await Promise.all([
        api.get('/donations'),
        api.get('/projects')
      ]);
      setDonations(donationsRes.data);
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Error fetching donations: ', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage({ type: '', text: '' });

    if (!form.project_id || !form.amount || !form.donor_name) {
      setMessage({ type: 'danger', text: 'Please provide project, amount, and your name.' });
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
        ...form,
        project_id: Number(form.project_id),
        amount: amountValue
      });
      setForm({ project_id: '', amount: '', donor_name: '', message: '' });
      setMessage({ type: 'success', text: 'Thank you for your donation.' });
      await loadData();
    } catch (error) {
      console.error('Error submitting donation: ', error);
      setMessage({ type: 'danger', text: 'Could not submit donation. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const getProjectTitle = (projectId) => {
    const match = projects.find((project) => project.id === projectId);
    return match ? match.title : 'Unknown Project';
  };

  return (
    <Container className="py-4">
      <div className="text-center mb-5">
        <h1 className="display-5 fw-bold">Donations</h1>
        <p className="text-muted">Support the initiatives that resonate with you.</p>
      </div>

      <Row className="g-4">
        <Col lg={5}>
          <Card className="border-0 shadow-sm bg-soft">
            <Card.Body>
              <Card.Title className="fw-bold">Make a Donation</Card.Title>
              <Form className="mt-3" onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Select Project *</Form.Label>
                  <Form.Select
                    value={form.project_id}
                    onChange={(event) => setForm({ ...form, project_id: event.target.value })}
                  >
                    <option value="">Choose...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Amount (USD) *</Form.Label>
                  <Form.Control
                    type="number"
                    min="1"
                    step="1"
                    placeholder="100"
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Your Name *</Form.Label>
                  <Form.Control
                    placeholder="Jane Doe"
                    value={form.donor_name}
                    onChange={(event) => setForm({ ...form, donor_name: event.target.value })}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Message</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Optional message"
                    value={form.message}
                    onChange={(event) => setForm({ ...form, message: event.target.value })}
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

        <Col lg={7}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <Card.Title className="fw-bold">Recent Donations</Card.Title>
              {loading ? (
                <div className="py-4 text-center">Loading donations...</div>
              ) : donations.length === 0 ? (
                <div className="py-4 text-center text-muted">No donations yet.</div>
              ) : (
                <Table responsive hover className="mt-3 align-middle">
                  <thead>
                    <tr>
                      <th>Donor</th>
                      <th>Project</th>
                      <th>Amount</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((donation) => (
                      <tr key={donation.id}>
                        <td>{donation.donor_name}</td>
                        <td>{getProjectTitle(donation.project_id)}</td>
                        <td>
                          <span className="badge-soft">
                            ${donation.amount.toFixed(2)}
                          </span>
                        </td>
                        <td className="text-muted">{donation.message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Donations;
