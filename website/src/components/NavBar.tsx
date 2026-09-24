import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

export function NavBar() {
  const { session } = useAuth();

  return (
    <header className="app-header">
      <h1>EnvironmentSensor</h1>
      {session ? (
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
          <button type="button" className="tab" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </nav>
      ) : (
        <nav className="tabs">
          <Link className="tab" to="/login">
            Log in
          </Link>
          <Link className="tab" to="/signup">
            Sign up
          </Link>
        </nav>
      )}
    </header>
  );
}
