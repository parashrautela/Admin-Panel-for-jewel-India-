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

  // The change being confirmed. Its form opens directly under the feature that was tapped.
  const [pending, setPending] = useState<{
    feature: FeatureFlagItem;
    targetEnabled: boolean;
    reset: boolean;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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

  function openChange(feature: FeatureFlagItem, targetEnabled: boolean, reset: boolean) {
    setPending({ feature, targetEnabled, reset });
    setReason('');
    setSaveError('');
    setSuccess('');
  }

  function handleSwitchClick(feature: FeatureFlagItem) {
    if (feature.parent_locked) return;
    openChange(feature, !feature.effective_enabled, false);
  }

  async function saveChange() {
    if (!pending) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason || trimmedReason.length > 500) {
      setSaveError('Please provide a reason between 1 and 500 characters.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (pending.reset) {
        await resetWholesalerFeatureFlag(
          wholesalerId,
          pending.feature.key,
          trimmedReason,
          pending.feature.version
        );
        setSuccess(`Reset ${pending.feature.label} to default.`);
      } else {
        await setWholesalerFeatureFlag(
          wholesalerId,
          pending.feature.key,
          pending.targetEnabled,
          trimmedReason,
          pending.feature.version
        );
        setSuccess(
          `${pending.feature.label} turned ${pending.targetEnabled ? 'on' : 'off'}.`
        );
      }
      setPending(null);
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
      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[12rem] flex-1">
            <SectionTitle>Feature Access</SectionTitle>
            <p className="text-xs text-gray-500">
              Configure per-wholesaler feature availability and global enforcement modes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        {busy && <p className="text-sm text-gray-500">Loading feature access…</p>}

        {!busy && !error && features.length > 0 && (
          <div className="space-y-3">
            {features.map((item) => {
              const isCustom = item.override_enabled !== null;
              const isLocked = item.parent_locked;
              const isPending = pending?.feature.key === item.key;
              const turningOff = isPending && !pending.reset && !pending.targetEnabled;
              return (
                <div
                  key={item.key}
                  className={`rounded-lg border transition-colors ${
                    isLocked
                      ? 'border-dashed border-gray-200 bg-gray-50 opacity-70'
                      : isPending
                        ? turningOff
                          ? 'border-red-300 bg-white'
                          : 'border-gray-400 bg-white'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{item.label}</span>
                        {isCustom && (
                          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Custom
                          </span>
                        )}
                        {item.key === 'publish_to_wholesaler' && (
                          <span className="inline-flex items-center rounded-md bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-500">
                            Not enforced yet
                          </span>
                        )}
                        {isLocked && (
                          <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-600">
                            Locked (Chamak disabled)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{item.description}</p>
                      {isCustom && item.reason && (
                        <p className="text-xs text-gray-500">
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
                          onClick={() => openChange(item, item.default_enabled, true)}
                          className="h-8 text-xs text-gray-500 hover:text-gray-900"
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
                          item.effective_enabled ? 'bg-black' : 'bg-gray-300'
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

                  {isPending && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveChange();
                      }}
                      className={`space-y-3 border-t p-4 ${turningOff ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                    >
                      <h3 className={`text-sm font-semibold ${turningOff ? 'text-red-700' : 'text-gray-900'}`}>
                        {pending.reset
                          ? `Reset ${item.label} to default`
                          : `Turn ${item.label} ${pending.targetEnabled ? 'on' : 'off'} for this wholesaler?`}
                      </h3>
                      {turningOff && item.key === 'chamak' && (
                        <p className="text-sm text-red-700">Turning Chamak off also turns Set Creation off.</p>
                      )}
                      <label className="block text-sm">
                        <FieldLabel>Reason (required)</FieldLabel>
                        <input
                          required
                          autoFocus
                          placeholder={turningOff ? 'Why is this being turned off?' : 'Why are you making this change?'}
                          maxLength={500}
                          value={reason}
                          disabled={saving}
                          onChange={(e) => setReason(e.target.value)}
                          className={inputClass}
                        />
                      </label>
                      {saveError && <Banner tone="danger" role="alert">{saveError}</Banner>}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="submit"
                          variant={turningOff ? 'danger' : 'primary'}
                          disabled={saving || !reason.trim()}
                          className={`h-9 ${turningOff ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:text-white' : ''}`}
                        >
                          {saving
                            ? 'Saving…'
                            : pending.reset
                              ? 'Reset'
                              : pending.targetEnabled
                                ? `Turn ${item.label} on`
                                : `Turn ${item.label} off`}
                        </Button>
                        <Button variant="secondary" disabled={saving} onClick={() => setPending(null)} className="h-9">
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Audit History View */}
        {showHistory && (
          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-900">Feature Flag Audit Log</h3>
            {auditLoading && <p className="text-xs text-gray-500">Loading audit rows…</p>}
            {!auditLoading && auditRows.length === 0 && (
              <p className="text-xs text-gray-500">No audit events recorded for this wholesaler.</p>
            )}
            {!auditLoading && auditRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-2">Time</th>
                      <th className="py-2">Feature</th>
                      <th className="py-2">Action</th>
                      <th className="py-2">New State</th>
                      <th className="py-2">Reason</th>
                      <th className="py-2">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {auditRows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-2 text-gray-500">{indiaTime(row.created_at)}</td>
                        <td className="py-2 font-medium text-gray-900">{row.feature_key}</td>
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
                        <td className="py-2 italic text-gray-500 max-w-xs truncate">{row.reason}</td>
                        <td className="py-2 text-gray-500">{row.actor}</td>
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
          <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Global Feature Catalog</h3>
              <p className="text-xs text-gray-500">
                System defaults and enforcement modes. Changing these affects all wholesalers who do not have an override.
              </p>
            </div>

            {catalogLoading && <p className="text-xs text-gray-500">Loading catalog…</p>}
            {!catalogLoading && catalogItems.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {catalogItems.map((c) => {
                  const editing = catalogEditor?.key === c.key;
                  return (
                    <div
                      key={c.key}
                      className={`space-y-1 rounded-md border p-3 text-xs ${
                        editing ? 'border-amber-400 sm:col-span-2' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900">{c.label} ({c.key})</span>
                        <span className={`rounded px-1.5 py-0.5 font-mono uppercase ${
                          c.enforcement_mode === 'enforce' ? 'bg-red-500/10 text-red-600' : c.enforcement_mode === 'log' ? 'bg-yellow-500/10 text-yellow-700' : 'bg-zinc-500/10 text-zinc-500'
                        }`}>
                          mode: {c.enforcement_mode}
                        </span>
                      </div>
                      <p className="text-gray-500">{c.description}</p>
                      <p className="text-gray-500">Default: {c.default_enabled ? 'ON' : 'OFF'}</p>
                      {!editing && (
                        <Button
                          variant="ghost"
                          disabled={saving}
                          onClick={() => {
                            setCatalogEditor(c);
                            setCatalogDefault(c.default_enabled);
                            setCatalogMode(c.enforcement_mode);
                            setConfirmKeyInput('');
                            setCatalogReason('');
                            setCatalogSaveError('');
                            setSuccess('');
                          }}
                          className="h-7 px-0 text-xs"
                        >
                          Configure Global Defaults
                        </Button>
                      )}

                      {editing && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveCatalog();
                          }}
                          className="mt-2 space-y-3 rounded-lg border border-amber-500/30 bg-amber-50 p-4 text-sm"
                        >
                          <h4 className="font-semibold text-amber-800">Edit global default: {c.label}</h4>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                              autoFocus
                              placeholder="Why are you updating the global configuration?"
                              maxLength={500}
                              value={catalogReason}
                              onChange={(e) => setCatalogReason(e.target.value)}
                              className={inputClass}
                            />
                          </label>
                          <label className="block">
                            <FieldLabel>Type "{c.key}" to confirm global change</FieldLabel>
                            <input
                              required
                              placeholder={c.key}
                              value={confirmKeyInput}
                              onChange={(e) => setConfirmKeyInput(e.target.value)}
                              className={inputClass}
                            />
                          </label>
                          {catalogSaveError && <Banner tone="danger" role="alert">{catalogSaveError}</Banner>}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="submit"
                              variant="primary"
                              disabled={saving || confirmKeyInput !== c.key || !catalogReason.trim()}
                              className="h-9"
                            >
                              {saving ? 'Updating…' : 'Save Global Changes'}
                            </Button>
                            <Button variant="secondary" disabled={saving} onClick={() => setCatalogEditor(null)} className="h-9">
                              Cancel
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
