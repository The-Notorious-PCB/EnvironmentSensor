import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

interface RegisteredDevice {
  device_id: string;
  api_key: string;
}

/** Calls the register_device RPC (see supabase/migrations and
 * shared/device-registration.md) — it generates the device's id and API
 * key server-side and returns the plaintext key exactly once. This page
 * never sees or stores it again after the user navigates away.
 */
export function RegisterDevicePage() {
  const [name, setName] = useState("");
  const [suitConfig, setSuitConfig] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState<RegisteredDevice | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { data, error: rpcError } = await supabase.rpc("register_device", {
      p_name: name,
      p_suit_config: suitConfig || null,
    });

    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    // register_device is `returns table (...)`, so PostgREST returns an
    // array even though this call always produces exactly one row.
    const row = Array.isArray(data) ? data[0] : data;
    setRegistered({ device_id: row.device_id, api_key: row.api_key });
  }

  async function copyApiKey() {
    if (!registered) return;
    try {
      await navigator.clipboard.writeText(registered.api_key);
      setCopied(true);
    } catch {
      // clipboard access can be denied (permissions, non-HTTPS context in
      // dev, etc.) — the key is still visible and selectable on the page.
    }
  }

  if (registered) {
    return (
      <div className="register-result">
        <h2>Device registered</h2>
        <p className="warning">
          This API key is shown <strong>once</strong>. Copy it now and store it
          somewhere safe (e.g. a password manager) — it cannot be shown again.
          Configure your laptop collector with these as{" "}
          <code>COLLECTOR_DEVICE_ID</code> and <code>COLLECTOR_API_KEY</code>{" "}
          (see collector/README.md).
        </p>
        <dl className="key-reveal">
          <dt>Device ID</dt>
          <dd>
            <code>{registered.device_id}</code>
          </dd>
          <dt>API key</dt>
          <dd>
            <code>{registered.api_key}</code>
          </dd>
        </dl>
        <button type="button" onClick={copyApiKey}>
          {copied ? "Copied" : "Copy API key"}
        </button>
        <p>
          <Link to="/devices">Go to your devices</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h2>Register a sensor array</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Helmet Array 1"
            required
          />
        </label>
        <label>
          Suit config (optional)
          <input
            value={suitConfig}
            onChange={(event) => setSuitConfig(event.target.value)}
            placeholder="I-S1 mock-up, full sensor loadout"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Registering…" : "Register device"}
        </button>
      </form>
    </div>
  );
}
