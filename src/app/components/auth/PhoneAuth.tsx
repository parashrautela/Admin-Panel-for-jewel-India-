import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';

export function PhoneAuth() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);

  // Note: Phone numbers should include country code for Supabase (e.g., +91 for India)
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return toast.error('Please enter a valid phone number');

    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('OTP sent successfully!');
      setStep('otp');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return toast.error('Please enter the OTP');

    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: otp,
      type: 'sms',
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else if (data.session) {
      toast.success('Logged in successfully!');
      // Assuming a page reload or router context update will handle the session state
      window.location.reload(); 
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto space-y-6 bg-white p-8 rounded-xl shadow-sm border border-gray-100">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {step === 'phone' ? 'Login with Phone' : 'Verify OTP'}
        </h1>
        <p className="text-sm text-gray-500">
          {step === 'phone'
            ? 'Enter your phone number to receive a secure code.'
            : 'Enter the 6-digit code sent to your phone.'}
        </p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder='+91 98765 43210'
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              className="text-lg"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending...' : 'Send OTP'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">One-Time Password</Label>
            <Input
              id="otp"
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              disabled={loading}
              className="text-center text-tracking-widest text-lg"
              maxLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify & Login'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep('phone')}
            className="w-full text-sm text-gray-500 hover:text-gray-900"
            disabled={loading}
          >
            Change Phone Number
          </Button>
        </form>
      )}
    </div>
  );
}
