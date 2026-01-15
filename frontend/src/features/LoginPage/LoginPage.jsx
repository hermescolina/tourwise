import React, { useState } from 'react';

const LoginPage = () => {
  const [credentials, setCredentials] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // We send 'username', but the backend can be 
          // programmed to check both username or email fields
          username: credentials.identifier, 
          password: credentials.password
        }),
      });

      const data = await response.json();
      console.log("data", data)
      if (response.ok) {
        localStorage.setItem('token', data.token);
        // Redirect to your admin or home dashboard
        // window.location.href = '/dashboard'; 
        window.location.href = '/'; 
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Unable to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-900">
      {/* Background Image Overlay */}
      <div className="absolute inset-0 z-0 opacity-60">
         <img 
           src="/path-to-your-sunset.jpg" 
           alt="Background" 
           className="w-full h-full object-cover"
         />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md p-8 m-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">TourWise 🌍</h1>
          <p className="text-slate-200">Welcome back, Jerome</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-100 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Username or Email</label>
            <input 
              type="text" 
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              placeholder="admin or test@mail.com"
              onChange={(e) => setCredentials({...credentials, identifier: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Password</label>
            <input 
              type="password" 
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
              placeholder="••••••••"
              onChange={(e) => setCredentials({...credentials, password: e.target.value})}
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg shadow-purple-900/20 transform active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isLoading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-300">
          Need access? <a href="#" className="text-purple-400 hover:underline">Contact System Admin</a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;