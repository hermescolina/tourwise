import React, { useState } from "react";

const TestPage = () => {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const testRedis = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/tred/test-redis");
      const data = await res.json();
    //   setResponse(data);
      setResponse({ statusCode: res.status, body: data });
    } catch (err) {
      setResponse({ status: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Redis Connection Test</h2>
      <button onClick={testRedis} disabled={loading}>
        {loading ? "Testing..." : "Test Redis Connection"}
      </button>

      {response && (
        <pre style={{ marginTop: "1rem", background: "#eee", padding: "1rem" }}>
          {JSON.stringify(response, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default TestPage;
