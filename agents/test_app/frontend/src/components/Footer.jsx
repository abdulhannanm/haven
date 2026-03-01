import React from 'react';
import Container from 'react-bootstrap/Container';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="footer mt-5 py-4">
      <Container>
        <div className="row text-center">
          <div className="col-md-4 mb-3">
            <h5>About Hack4Humanity</h5>
            <p className="text-muted">
              A global initiative connecting passionate individuals with impactful projects 
              that address critical social and environmental challenges.
            </p>
          </div>
          
          <div className="col-md-4 mb-3">
            <h5>Quick Links</h5>
            <ul className="list-unstyled text-muted">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/projects">Projects</Link></li>
              <li><Link to="/donations">Donations</Link></li>
              <li><Link to="/volunteers">Volunteers</Link></li>
              <li><Link to="/stats">Stats</Link></li>
            </ul>
          </div>
          
          <div className="col-md-4 mb-3">
            <h5>Contact</h5>
            <ul className="list-unstyled text-muted">
              <li><a href="mailto:info@hack4humanity.org">info@hack4humanity.org</a></li>
              <li><a href="tel:+15551234567">+1 (555) 123-4567</a></li>
              <li><a href="https://example.com" target="_blank" rel="noreferrer">@Hack4Humanity</a> on social media</li>
            </ul>
          </div>
        </div>
        
        <hr />
        
        <div className="row">
          <div className="col-12 text-center">
            <p className="text-muted mb-0">
              &copy; 2026 Hack4Humanity. All rights reserved. 
              <a href="#">Privacy Policy</a> | <a href="#">Terms of Service</a>
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
