import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <div className="card">
        <p>The page you asked for does not exist.</p>
        <p style={{ marginTop: 12 }}><Link to="/">Go to the home page</Link></p>
      </div>
    </>
  );
}
