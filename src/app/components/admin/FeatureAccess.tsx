import { useEffect, useState } from 'react';
import {
  fetchWholesalerFeatureFlags,
  setWholesalerFeatureFlag,
  resetWholesalerFeatureFlag,
  fetchFeatureFlagAudit,
  fetchFeatureCatalog,
  setFeatureCatalog,
  type FeatureFlagItem,
} from '../../../lib/adminApi';
// Self-contained UI primitives matching admin panel styles without external ui.tsx dependency
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40 focus-visible:ring-offset-2';
const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/15 disabled:bg-gray-100 disabled:text-gray-400';

function Card({
  children,
  className = '',
  ...rest
}: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${className}`} {...rest}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-medium text-gray-900">{children}</h2>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-gray-900">{children}</span>;
}

function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const variants = {
    primary: 'bg-black text-white hover:bg-gray-800 border border-black disabled:bg-gray-400 disabled:border-gray-400',
    secondary: 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
    ghost: 'bg-transparent text-gray-900 hover:underline underline-offset-4 disabled:text-gray-400',
    danger: 'bg-white text-red-600 border border-red-300 hover:bg-red-50 disabled:text-gray-400',
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${FOCUS_RING} ${className}`}
      {...rest}
    />
  );
}

function Banner({
  tone = 'info',
  role = 'status',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  role?: 'status' | 'alert';
  children: React.ReactNode;
}) {
  const tones = {
    info: 'bg-gray-50 border-gray-200 text-gray-900',
    success: 'bg-green-50 border-green-200 text-green-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
  };
  return (
    <p role={role} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}

const indiaTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' IST';

export function FeatureAccessPanel({ wholesalerId }: { wholesalerId: string }) {
  const [features, setFeatures] = useState<FeatureFlagItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0);

  // Editor state for changing or resetting an individual feature
  const [editor, setEditor] = useState<{
    feature: FeatureFlagItem;
    targetEnabled: boolean;
    reset: boolean;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Confirmation dialog state for turning a feature OFF
  const [confirmOff, setConfirmOff] = useState<{
    feature: FeatureFlagItem;
  } | null>(null);

  // Audit history state
  const [showHistory, setShowHistory] = useState(false);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Global catalog defaults section state
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogEditor, setCatalogEditor] = useState<any | null>(null);
  const [confirmKeyInput, setConfirmKeyInput] = useState('');
  const [catalogReason, setCatalogReason] = useState('');
  const [catalogMode, setCatalogMode] = useState<'off' | 'log' | 'enforce'>('off');
  const [catalogDefault, setCatalogDefault] = useState(true);
  const [catalogSaveError, setCatalogSaveError] = useState('');

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    fetchWholesalerFeatureFlags(wholesalerId)
      .then((data) => {
        if (active && data?.ok) {
          setFeatures(data.features || []);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load feature flags.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [wholesalerId, revision]);

  // Load audit history
  async function loadHistory() {
    setAuditLoading(true);
    try {
      const data = await fetchFeatureFlagAudit(wholesalerId);
      if (data?.ok) {
        setAuditRows(data.rows || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load audit history.');
    } finally {
      setAuditLoading(false);
    }
  }

  // Load global catalog
  async function loadCatalog() {
    setCatalogLoading(true);
    try {
      const data = await fetchFeatureCatalog();
      if (data?.ok) {
        setCatalogItems(data.catalog || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load catalog.');
    } finally {
      setCatalogLoading(false);
    }
  }

  function handleSwitchClick(feature: FeatureFlagItem) {
    if (feature.parent_locked) return;
    const target = !feature.effective_enabled;
    if (!target) {
      // Turning off requires confirmation dialog
      setConfirmOff({ feature });
      setReason('');
      setSaveError('');
    } else {
      // Turning on
      setEditor({ feature, targetEnabled: true, reset: false });
      setReason('');
      setSaveError('');
    }
  }

  async function saveChange() {
    if (!editor) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason || trimmedReason.length > 500) {
      setSaveError('Please provide a reason between 1 and 500 characters.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (editor.reset) {
        await resetWholesalerFeatureFlag(
          wholesalerId,
          editor.feature.key,
          trimmedReason,
          editor.feature.version
        );
        setSuccess(`Reset ${editor.feature.label} to default.`);
      } else {
        await setWholesalerFeatureFlag(
          wholesalerId,
          editor.feature.key,
          editor.targetEnabled,
          trimmedReason,
          editor.feature.version
        );
        setSuccess(
          `${editor.feature.label} set to ${editor.targetEnabled ? 'Enabled' : 'Disabled'}.`
        );
      }
      setEditor(null);
      setConfirmOff(null);
      setRevision((n) => n + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update feature.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCatalog() {
    if (!catalogEditor) return;
    if (confirmKeyInput !== catalogEditor.key) {
      setCatalogSaveError(`Type "${catalogEditor.key}" exactly to confirm.`);
      return;
    }
    const trimmed = catalogReason.trim();
    if (!trimmed || trimmed.length > 500) {
      setCatalogSaveError('Please provide a reason between 1 and 500 characters.');
      return;
    }
    setSaving(true);
    setCatalogSaveError('');
    try {
      await setFeatureCatalog(catalogEditor.key, catalogDefault, catalogMode, trimmed);
      setSuccess(`Updated global catalog for ${catalogEditor.label}.`);
      setCatalogEditor(null);
      loadCatalog();
      setRevision((n) => n + 1);
    } catch (err) {
      setCatalogSaveError(err instanceof Error ? err.message : 'Failed to update catalog.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="features" aria-label="Feature Access Controls" className="mt-6">
      <Card className="@container space-y-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SectionTitle>Feature Access</SectionTitle>
            <p className="text-xs text-ink-muted">
              Configure per-wholesaler feature availability and global enforcement modes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              disabled={busy || saving}
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) loadHistory();
              }}
              className="h-9"
            >
              {showHistory ? 'Hide history' : 'View history'}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || saving}
              onClick={() => {
                setShowCatalog(!showCatalog);
                if (!showCatalog) loadCatalog();
              }}
              className="h-9"
            >
              {showCatalog ? 'Hide defaults' : 'Global defaults'}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || saving}
              onClick={() => setRevision((n) => n + 1)}
              className="h-9"
            >
              Refresh
            </Button>
          </div>
        </div>

        {error && <Banner tone="danger" role="alert">{error}</Banner>}
        {success && <Banner tone="success" role="status">{success}</Banner>}
        {busy && <p className="text-sm text-ink-muted">Loading feature access…</p>}

        {!busy && !error && features.length > 0 && (
          <div className="space-y-3">
            {features.map((item) => {
              const isCustom = item.override_enabled !== null;
              const isLocked = item.parent_locked;
              return (
                <div
                  key={item.key}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4 transition-colors ${
                    isLocked ? 'border-dashed border-hairline bg-surface-1 opacity-70' : 'border-hairline bg-canvas'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{item.label}</span>
                      {isCustom && (
                        <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Custom
                        </span>
                      )}
                      {item.key === 'publish_to_wholesaler' && (
                        <span className="inline-flex items-center rounded-md bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-500">
                          Not enforced yet
                        </span>
                      )}
                      {isLocked && (
                        <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">
                          Locked (Chamak disabled)
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted">{item.description}</p>
                    {isCustom && item.reason && (
                      <p className="text-xs text-ink-muted">
                        Override reason: <span className="italic">{item.reason}</span>
                        {item.updated_at && ` · ${indiaTime(item.updated_at)}`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {isCustom && (
                      <Button
                        variant="ghost"
                        disabled={saving || isLocked}
                        onClick={() => {
                          setEditor({ feature: item, targetEnabled: item.default_enabled, reset: true });
                          setReason('');
                          setSaveError('');
                        }}
                        className="h-8 text-xs text-ink-muted hover:text-ink"
                      >
                        Reset to default
                      </Button>
                    )}

                    <button
                      type="button"
                      disabled={saving || isLocked}
                      onClick={() => handleSwitchClick(item)}
                      aria-pressed={item.effective_enabled}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${FOCUS_RING} ${
                        item.effective_enabled ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
                      } ${isLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span className="sr-only">Toggle {item.label}</span>
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          item.effective_enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Confirmation Dialog for Turning OFF */}
        {confirmOff && !editor && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3">
            <h3 className="text-base font-semibold text-red-600 dark:text-red-400">
              Confirm Disabling {confirmOff.feature.label}
            </h3>
            <p className="text-sm text-ink-muted">
              Are you sure you want to disable <strong>{confirmOff.feature.label}</strong> for this wholesaler?
              {confirmOff.feature.key === 'chamak' && (
                <span className="block mt-1 text-red-500 font-medium">
                  Disabling Chamak will also automatically lock Set Creation off.
                </span>
              )}
            </p>
            <label className="block text-sm">
              <FieldLabel>Reason for disabling (required)</FieldLabel>
              <input
                required
                placeholder="Explain why this feature is being disabled..."
                maxLength={500}
                value={reason}
                disabled={saving}
                onChange={(e) => setReason(e.target.value)}
                className={inputClass}
              />
            </label>
            {saveError && <Banner tone="danger" role="alert">{saveError}</Banner>}
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={saving || !reason.trim()}
                onClick={() => {
                  setEditor({ feature: confirmOff.feature, targetEnabled: false, reset: false });
                  void saveChange();
                }}
                className="h-9 bg-red-600 text-white hover:bg-red-700"
              >
                {saving ? 'Disabling…' : 'Disable Feature'}
              </Button>
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => setConfirmOff(null)}
                className="h-9"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Editor Form for Turning ON or Resetting */}
        {editor && !confirmOff && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveChange();
            }}
            className="space-y-3 rounded-lg border border-hairline bg-canvas p-4"
          >
            <h3 className="text-base font-medium text-ink">
              {editor.reset ? `Reset ${editor.feature.label} to Default` : `Enable ${editor.feature.label}`}
            </h3>
            <label className="block text-sm">
              <FieldLabel>Reason (required)</FieldLabel>
              <input
                required
                placeholder="Why are you making this change?"
                maxLength={500}
                value={reason}
                disabled={saving}
                onChange={(e) => setReason(e.target.value)}
                className={inputClass}
              />
            </label>
            {saveError && <Banner tone="danger" role="alert">{saveError}</Banner>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={saving || !reason.trim()} className="h-9">
                {saving ? 'Saving…' : editor.reset ? 'Confirm Reset' : 'Confirm Enable'}
              </Button>
              <Button variant="secondary" disabled={saving} onClick={() => setEditor(null)} className="h-9">
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Audit History View */}
        {showHistory && (
          <div className="mt-4 space-y-3 border-t border-hairline pt-4">
            <h3 className="text-sm font-medium text-ink">Feature Flag Audit Log</h3>
            {auditLoading && <p className="text-xs text-ink-muted">Loading audit rows…</p>}
            {!auditLoading && auditRows.length === 0 && (
              <p className="text-xs text-ink-muted">No audit events recorded for this wholesaler.</p>
            )}
            {!auditLoading && auditRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-ink-muted">
                      <th className="py-2">Time</th>
                      <th className="py-2">Feature</th>
                      <th className="py-2">Action</th>
                      <th className="py-2">New State</th>
                      <th className="py-2">Reason</th>
                      <th className="py-2">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {auditRows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-2 text-ink-muted">{indiaTime(row.created_at)}</td>
                        <td className="py-2 font-medium text-ink">{row.feature_key}</td>
                        <td className="py-2 uppercase text-xs">{row.action}</td>
                        <td className="py-2">
                          {row.new_value?.enabled !== undefined ? (
                            <span className={row.new_value.enabled ? 'text-emerald-600' : 'text-red-500'}>
                              {row.new_value.enabled ? 'ON' : 'OFF'}
                            </span>
                          ) : (
                            'Default'
                          )}
                        </td>
                        <td className="py-2 italic text-ink-muted max-w-xs truncate">{row.reason}</td>
                        <td className="py-2 text-ink-muted">{row.actor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Global Catalog Defaults Section */}
        {showCatalog && (
          <div className="mt-4 space-y-4 border-t border-hairline pt-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Global Feature Catalog</h3>
              <p className="text-xs text-ink-muted">
                System defaults and enforcement modes. Changing these affects all wholesalers who do not have an override.
              </p>
            </div>

            {catalogLoading && <p className="text-xs text-ink-muted">Loading catalog…</p>}
            {!catalogLoading && catalogItems.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {catalogItems.map((c) => (
                  <div key={c.key} className="rounded-md border border-hairline p-3 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-ink">{c.label} ({c.key})</span>
                      <span className={`px-1.5 py-0.5 rounded font-mono uppercase ${
                        c.enforcement_mode === 'enforce' ? 'bg-red-500/10 text-red-600' : c.enforcement_mode === 'log' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-zinc-500/10 text-zinc-500'
                      }`}>
                        mode: {c.enforcement_mode}
                      </span>
                    </div>
                    <p className="text-ink-muted">{c.description}</p>
                    <p className="text-ink-muted">Default: {c.default_enabled ? 'ON' : 'OFF'}</p>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCatalogEditor(c);
                        setCatalogDefault(c.default_enabled);
                        setCatalogMode(c.enforcement_mode);
                        setConfirmKeyInput('');
                        setCatalogReason('');
                        setCatalogSaveError('');
                      }}
                      className="h-7 text-xs"
                    >
                      Configure Global Defaults
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {catalogEditor && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 text-sm">
                <h4 className="font-semibold text-amber-700 dark:text-amber-300">
                  Edit Global Default: {catalogEditor.label}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <FieldLabel>Default State</FieldLabel>
                    <select
                      value={catalogDefault ? 'true' : 'false'}
                      onChange={(e) => setCatalogDefault(e.target.value === 'true')}
                      className={inputClass}
                    >
                      <option value="true">Enabled by default</option>
                      <option value="false">Disabled by default</option>
                    </select>
                  </label>
                  <label className="block">
                    <FieldLabel>Enforcement Mode</FieldLabel>
                    <select
                      value={catalogMode}
                      onChange={(e) => setCatalogMode(e.target.value as any)}
                      className={inputClass}
                    >
                      <option value="off">off (no enforcement)</option>
                      <option value="log">log (log only)</option>
                      <option value="enforce">enforce (block disallowed actions)</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <FieldLabel>Reason (required)</FieldLabel>
                  <input
                    required
                    placeholder="Why are you updating the global configuration?"
                    maxLength={500}
                    value={catalogReason}
                    onChange={(e) => setCatalogReason(e.target.value)}
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <FieldLabel>Type "{catalogEditor.key}" to confirm global change</FieldLabel>
                  <input
                    required
                    placeholder={catalogEditor.key}
                    value={confirmKeyInput}
                    onChange={(e) => setConfirmKeyInput(e.target.value)}
                    className={inputClass}
                  />
                </label>

                {catalogSaveError && <Banner tone="danger" role="alert">{catalogSaveError}</Banner>}

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    disabled={saving || confirmKeyInput !== catalogEditor.key || !catalogReason.trim()}
                    onClick={() => void saveCatalog()}
                    className="h-9"
                  >
                    {saving ? 'Updating…' : 'Save Global Changes'}
                  </Button>
                  <Button variant="secondary" disabled={saving} onClick={() => setCatalogEditor(null)} className="h-9">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
