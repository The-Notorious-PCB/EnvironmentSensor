import { Link } from "react-router-dom";

export function NavBar() {
  return (
    <header className="app-header">
      <h1>EnvironmentSensor</h1>
      <nav className="tabs">
        <Link className="tab" to="/devices">
          Devices
        </Link>
        <Link className="tab" to="/register">
          Register
        </Link>
        <Link className="tab" to="/live">
          Live
        </Link>
        <Link className="tab" to="/history">
          History
        </Link>
      </nav>
    </header>
  );
}
