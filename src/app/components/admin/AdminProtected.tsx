import React, { useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { adminSession } from '../../../lib/adminSession';
export function AdminProtected({ children }: { children: React.ReactNode }) {
  const [isAuthenticated,setIsAuthenticated]=useState(!!adminSession.password);
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const handleLogin=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');
    const result=await supabase.functions.invoke('admin-verify-password',{headers:{'x-admin-password':password}});
    setBusy(false);
    if(result.error){setError('Could not sign in. Check your password and connection.');return;}
    adminSession.password=password;setPassword('');setIsAuthenticated(true);
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Admin Login</h2>
          <p className="text-sm text-gray-500 mt-2">Enter password to access the admin panel</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter admin password"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button disabled={busy}
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
