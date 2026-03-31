import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Lock, Delete, Loader2, ShieldAlert } from 'lucide-react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';

interface AdminPinGateProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AdminPinGate({ open, onSuccess, onCancel }: AdminPinGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  const MAX_ATTEMPTS = 3;
  const LOCKOUT_SECONDS = 300; // 5 minutes

  const handleNumberPress = (num: string) => {
    if (pin.length < 6 && !isLocked) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-admin-pin', {
        body: { pin }
      });

      if (fnError) throw fnError;

      if (data?.success) {
        toast.success('Access granted');
        setPin('');
        setAttempts(0);
        onSuccess();
      } else if (data?.locked) {
        setIsLocked(true);
        setError(`Too many attempts. Locked for ${Math.ceil(data.lockoutRemaining / 60)} minutes.`);
        setTimeout(() => {
          setIsLocked(false);
          setAttempts(0);
        }, data.lockoutRemaining * 1000);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');
        
        if (newAttempts >= MAX_ATTEMPTS) {
          setIsLocked(true);
          setError(`Too many attempts. Locked for 5 minutes.`);
          setTimeout(() => {
            setIsLocked(false);
            setAttempts(0);
          }, LOCKOUT_SECONDS * 1000);
        } else {
          setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempts remaining.`);
        }
      }
    } catch (err) {
      console.error('PIN verification error:', err);
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const numpadButtons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'];

  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent className="sm:max-w-md bg-neutral-950 border-white/10 text-white">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            {isLocked ? (
              <ShieldAlert className="w-8 h-8 text-red-400" />
            ) : (
              <Lock className="w-8 h-8 text-white/70" />
            )}
          </div>
          <DialogTitle className="text-xl font-semibold text-center">
            Admin Access
          </DialogTitle>
          <DialogDescription className="text-white/60 text-center">
            Enter your PIN to access the admin panel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* PIN Display */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full border border-white/20"
              />
            ))}
          </div>

          {/* Error Message */}
          {error && (
              <p
                className="text-red-400 text-sm text-center"
              >
                {error}
              </p>
            )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
            {numpadButtons.map((btn) => {
              if (btn === 'clear') {
                return (
                  <Button
                    key={btn}
                    variant="ghost"
                    onClick={handleClear}
                    disabled={isLocked || isVerifying}
                    className="h-14 text-white/60 hover:text-white hover:bg-white/10"
                  >
                    Clear
                  </Button>
                );
              }
              if (btn === 'delete') {
                return (
                  <Button
                    key={btn}
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={isLocked || isVerifying}
                    className="h-14 text-white/60 hover:text-white hover:bg-white/10"
                  >
                    <Delete className="w-5 h-5" />
                  </Button>
                );
              }
              return (
                <Button
                  key={btn}
                  variant="ghost"
                  onClick={() => handleNumberPress(btn)}
                  disabled={isLocked || isVerifying}
                  className="h-14 text-xl font-medium text-white hover:bg-white/10"
                >
                  {btn}
                </Button>
              );
            })}
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isVerifying}
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={pin.length < 4 || isVerifying || isLocked}
              className="flex-1 bg-white text-black hover:bg-white/90"
            >
              {isVerifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Enter'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
