// v3.34.0 — data management that actually works.
//
// The delete button posted to functions/v1/delete-account, deleted in the
// v3.21.0 cleanup, so it 404'd silently. Deletion now runs in the database
// through self_delete_account. Export is new, and the dialog offers pausing
// as the lighter thing most people clicking delete are really after.
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Download, PauseCircle } from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import {
  DELETION_REMOVED_SEEKER, DELETION_REMOVED_EMPLOYER, clearLocalTraces, downloadJson,
  selfDeleteAccount, selfExportAccount, selfPauseAccount,
} from '@/lib/account';
import { useUserRole } from '@/hooks/useUserRole';

interface PrivacySettingsProps {
  userId: string;
  session: Session;
}

export const PrivacySettings = ({ userId, session }: PrivacySettingsProps) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { role } = useUserRole(userId);
  const isEmployer = role === 'employer';

  const email = session.user?.email || '';

  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typedEmail, setTypedEmail] = useState('');
  const [working, setWorking] = useState<'delete' | 'pause' | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = await selfExportAccount();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`ayn-export-${stamp}.json`, payload);
      toast({ title: 'Export ready', description: 'Your data has been downloaded as a JSON file.' });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Could not build the export',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const handlePause = async () => {
    setWorking('pause');
    try {
      await selfPauseAccount();
      setDeleteOpen(false);
      toast({
        title: 'Account paused',
        description: isEmployer
          ? 'We have turned every email off. Nothing else changed, and nothing was deleted.'
          : 'Employers can no longer find you and we have turned every email off. Nothing was deleted.',
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Could not pause the account',
        variant: 'destructive',
      });
    } finally {
      setWorking(null);
    }
  };

  const handleDeleteAccount = async () => {
    setWorking('delete');
    try {
      await selfDeleteAccount(typedEmail.trim());
      clearLocalTraces();
      await supabase.auth.signOut();
      toast({ title: 'Account deleted', description: 'Your account and its contents have been removed.' });
      navigate('/');
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Could not delete the account',
        variant: 'destructive',
      });
    } finally {
      setWorking(null);
    }
  };

  const emailMatches = typedEmail.trim().toLowerCase() === email.toLowerCase() && email.length > 0;

  return (
    <div className="space-y-6">
      <div className="lp-panel">
        <h2 className="text-xl font-semibold mb-6">{t('settings.dataManagement')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>Download your data</Label>
              <p className="text-sm text-muted-foreground">
                One file with your profile, resume, tailored documents, saved jobs, proposals and assessment history.
              </p>
            </div>
            <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm shrink-0" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? 'Preparing' : 'Export'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
            <div className="space-y-0.5">
              <Label className="text-destructive">{t('settings.deleteAccount')}</Label>
              <p className="text-sm text-muted-foreground">
                Removes your account and everything in it. This cannot be undone.
              </p>
            </div>
            <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setTypedEmail(''); }}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="gap-2 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                  {t('settings.deleteAccount')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Delete your account</DialogTitle>
                  <DialogDescription>
                    This is permanent. Read what goes and what stays before you confirm.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 text-sm">
                  <div>
                    <p className="font-medium text-destructive">What is removed</p>
                    <ul className="mt-2 space-y-1 text-muted-foreground list-disc pl-5">
                      {(isEmployer ? DELETION_REMOVED_EMPLOYER : DELETION_REMOVED_SEEKER).map(item => <li key={item}>{item}</li>)}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/40 p-4">
                    <p className="font-medium flex items-center gap-2">
                      <PauseCircle className="h-4 w-4" /> Want to stop rather than destroy?
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {isEmployer
                        ? 'Pausing turns off every email. Nothing else changes: your company profile and history stay exactly as they are.'
                        : 'Pausing hides you from employers and turns every email off. Your resume, profile and documents stay exactly where they are, and you can turn discovery back on at any time.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={handlePause} disabled={working !== null}>
                        {working === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pause instead'}
                      </button>
                      <button
                        type="button"
                        className="lp-quiet-link"
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
                        onClick={handleExport}
                        disabled={exporting}
                      >
                        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Download my data first'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-email">
                      Type {email} to confirm
                    </Label>
                    <Input
                      id="confirm-email"
                      value={typedEmail}
                      onChange={(e) => setTypedEmail(e.target.value)}
                      placeholder={email}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <button type="button" className="lp-btn lp-btn-ghost" onClick={() => setDeleteOpen(false)} disabled={working !== null}>
                    {t('common.cancel')}
                  </button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={!emailMatches || working !== null}
                  >
                    {working === 'delete'
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : 'Delete my account permanently'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
};
