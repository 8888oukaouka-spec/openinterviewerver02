'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isPendingStudyStub, StudyWorkspaceItem } from '@/types';
import {
  deleteStudy,
  getAllStudies,
  reconcileStudyOperations,
  getAllProjects,
  createNewProject,
  renameProject,
  removeProject,
  moveStudyToProject,
  type StoredProject,
} from '@/services/storageService';
import { Button, Coordinate, Label, Measure, Rule } from '@/components/ui';

const UNCATEGORIZED_KEY = '__uncategorized__';

export default function StudyList() {
  const router = useRouter();
  const [studies, setStudies] = useState<StudyWorkspaceItem[]>([]);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [kvWarning, setKvWarning] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleMessage, setSampleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hostedMode, setHostedMode] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  // Project accordion state
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // New project form
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Inline rename
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  // Move study modal
  const [moveStudyId, setMoveStudyId] = useState<string | null>(null);
  const [movingStudy, setMovingStudy] = useState(false);

  const [projectMenuOpenId, setProjectMenuOpenId] = useState<string | null>(null);

  // Close any open dropdown when clicking outside it
  useEffect(() => {
    if (menuOpenId === null && projectMenuOpenId === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('[data-dropdown]') || target.closest('[data-dropdown-trigger]')) return;
      setMenuOpenId(null);
      setProjectMenuOpenId(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpenId, projectMenuOpenId]);

  const actionsTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const projectMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Derived: group studies by project
  const { projectGroups, uncategorized } = useMemo(() => {
    const assigned = new Set<string>();
    const groups = projects.map(p => {
      const pStudies = studies.filter(s => {
        if (isPendingStudyStub(s)) return false;
        return s.projectId === p.id;
      });
      pStudies.forEach(s => assigned.add(s.id));
      return { project: p, studies: pStudies };
    });
    const unc = studies.filter(s => !assigned.has(s.id));
    return { projectGroups: groups, uncategorized: unc };
  }, [studies, projects]);

  const hasProjects = projects.length > 0;

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [studyResult, projectResult] = await Promise.all([
        getAllStudies(),
        getAllProjects(),
      ]);
      setStudies(studyResult.studies);
      setProjects(projectResult.projects);
      setKvWarning(
        studyResult.warning ||
        (studyResult.outcome.status !== 'ok' ? studyResult.outcome.error : null),
      );
      if (studyResult.pendingStudies && studyResult.pendingStudies.length > 0) {
        setOperationNotice(
          `${studyResult.pendingStudies.length} study operation(s) are awaiting reconciliation.`,
        );
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runReconciliation = async () => {
    setIsReconciling(true);
    const result = await reconcileStudyOperations();
    if (!result.success) {
      setOperationNotice(result.error || 'Study reconciliation is temporarily unavailable.');
    } else if (result.stillPending > 0) {
      setOperationNotice(
        `${result.stillPending} study operation(s) are still inside the safety window. Retry shortly.`
      );
    } else if (result.completed > 0 || result.rolledBack > 0) {
      setOperationNotice('Pending study changes were reconciled successfully.');
    } else {
      setOperationNotice(null);
    }
    setIsReconciling(false);
    await loadData();
  };

  useEffect(() => {
    const initializeWorkspace = async () => {
      let hosted = false;
      try {
        const response = await fetch('/api/config/mode');
        const data = await response.json();
        hosted = data.mode === 'hosted';
      } catch {
        hosted = false;
      }
      setHostedMode(hosted);
      if (hosted) {
        await runReconciliation();
      } else {
        await loadData();
      }
    };
    void initializeWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showNewProjectForm) {
      newProjectInputRef.current?.focus();
    }
  }, [showNewProjectForm]);

  useEffect(() => {
    if (editingProjectId) {
      renameInputRef.current?.focus();
    }
  }, [editingProjectId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this study? This cannot be undone.')) {
      return;
    }
    setDeletingId(id);
    try {
      const result = await deleteStudy(id);
      if (result.success) {
        setStudies(studies.filter(s => s.id !== id));
      } else if (result.pending) {
        setOperationNotice(result.error || 'Study deletion is awaiting reconciliation.');
      } else {
        alert(result.error || 'Failed to delete study');
      }
    } catch (error) {
      console.error('Error deleting study:', error);
      alert('Failed to delete study');
    } finally {
      setDeletingId(null);
      setMenuOpenId(null);
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setSampleMessage(null);
    try {
      const response = await fetch('/api/demo/seed', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setSampleMessage({
          type: 'success',
          text: `Sample workspace loaded: ${data.data.studiesSeeded} study, ${data.data.interviewsSeeded} interviews`
        });
        await loadData();
      } else {
        setSampleMessage({ type: 'error', text: data.error || 'Failed to load sample workspace' });
      }
    } catch (error) {
      console.error('Error loading sample workspace:', error);
      setSampleMessage({ type: 'error', text: 'Failed to load sample workspace' });
    } finally {
      setLoadingSample(false);
    }
  };

  const handleClearSample = async () => {
    if (!confirm('Clear the synthetic sample study and interviews from this workspace?')) return;
    setLoadingSample(true);
    setSampleMessage(null);
    try {
      const response = await fetch('/api/demo/seed', { method: 'DELETE' });
      const data = await response.json();
      if (response.ok) {
        setSampleMessage({ type: 'success', text: 'Sample workspace cleared' });
        await loadData();
      } else {
        setSampleMessage({ type: 'error', text: data.error || 'Failed to clear sample workspace' });
      }
    } catch (error) {
      console.error('Error clearing sample workspace:', error);
      setSampleMessage({ type: 'error', text: 'Failed to clear sample workspace' });
    } finally {
      setLoadingSample(false);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      const result = await createNewProject(name);
      if (result.project) {
        setProjects(prev => [result.project!, ...prev]);
        setNewProjectName('');
        setShowNewProjectForm(false);
      } else {
        alert(result.error || 'Failed to create project');
      }
    } catch {
      alert('Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const startRename = (project: StoredProject) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
    setMenuOpenId(null);
    setProjectMenuOpenId(null);
  };

  const commitRename = async () => {
    if (!editingProjectId) return;
    const name = editingProjectName.trim();
    if (!name) { setEditingProjectId(null); return; }
    const result = await renameProject(editingProjectId, name);
    if (result.project) {
      setProjects(prev => prev.map(p => p.id === editingProjectId ? result.project! : p));
    } else {
      alert(result.error || 'Failed to rename project');
    }
    setEditingProjectId(null);
  };

  const handleDeleteProject = async (project: StoredProject) => {
    if (!confirm(`Delete project "${project.name}"? Studies in this project will become uncategorized. Interview data is not deleted.`)) return;
    const result = await removeProject(project.id);
    if (result.success) {
      setProjects(prev => prev.filter(p => p.id !== project.id));
      await loadData();
    } else {
      alert(result.error || 'Failed to delete project');
    }
  };

  const handleMoveStudy = async (targetProjectId: string | null) => {
    if (!moveStudyId) return;
    setMovingStudy(true);
    try {
      const result = await moveStudyToProject(moveStudyId, targetProjectId);
      if (result.success) {
        await loadData();
        setMoveStudyId(null);
      } else {
        alert(result.error || 'Failed to move study');
      }
    } catch {
      alert('Failed to move study');
    } finally {
      setMovingStudy(false);
    }
  };

  const hasSampleData = studies.some(s => s.id.startsWith('demo-'));

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

  const handleTbodyKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-row-primary]')
    );
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) return;
    const nextIndex = event.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= buttons.length) return;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  const moveStudySubject = moveStudyId ? studies.find(s => s.id === moveStudyId) : null;
  const moveStudyName = moveStudySubject && !isPendingStudyStub(moveStudySubject)
    ? moveStudySubject.config.name : '';
  const moveStudyCurrentProjectId = moveStudySubject && !isPendingStudyStub(moveStudySubject)
    ? moveStudySubject.projectId ?? null : null;

  // Renders a study as a table row. Used in both flat and accordion views.
  const renderStudyRow = (study: StudyWorkspaceItem, indent = false) => {
    const pending = isPendingStudyStub(study);
    const name = pending ? 'Study change pending' : study.config.name;
    return (
      <tr
        key={study.id}
        className="border-b border-ink-200 hover:bg-paper-1"
        onClick={() => router.push(`/studies/${study.id}`)}
      >
        <td className={`px-3 py-3 align-top text-[13px] text-ink-700 ${indent ? 'pl-10' : ''}`}>
          <button
            type="button"
            data-row-primary
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/studies/${study.id}`);
            }}
            className="text-left font-sans text-[14px] font-medium text-ink-900 underline-offset-2 hover:text-action hover:underline"
          >
            {name}
          </button>
          {pending ? (
            <p className="text-[13px] text-ink-500">Reconciliation pending ({study.phase})</p>
          ) : study.config.description ? (
            <p className="line-clamp-1 text-[13px] text-ink-500">{study.config.description}</p>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top text-[13px] text-ink-700">
          <Coordinate>{pending ? 0 : study.interviewCount}</Coordinate>
        </td>
        <td className="hidden px-3 py-3 align-top text-[13px] text-ink-700 md:table-cell">
          <Coordinate>{pending ? '—' : formatDate(study.createdAt)}</Coordinate>
        </td>
        <td className="hidden px-3 py-3 align-top text-[13px] text-ink-700 md:table-cell">
          <Coordinate>{pending ? '—' : study.config.coreQuestions.length}</Coordinate>
        </td>
        <td className="px-3 py-3 align-top text-[13px] text-ink-700">
          {pending ? (
            <span className="text-error">Reconciliation pending</span>
          ) : (
            <span className={study.isLocked ? 'text-ink-500' : 'text-success'}>
              {study.isLocked ? 'Locked' : 'Editable'}
            </span>
          )}
        </td>
        <td
          className="relative px-3 py-3 align-top text-[13px]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            data-dropdown-trigger
            ref={(el) => { actionsTriggerRefs.current[study.id] = el; }}
            onClick={() => setMenuOpenId(menuOpenId === study.id ? null : study.id)}
            aria-label={`Open actions for ${name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpenId === study.id}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[14px] leading-none text-ink-400 hover:bg-paper-pop hover:text-ink-900"
          >
            ···
          </button>
          {menuOpenId === study.id && (
            <div
              data-dropdown
              className="absolute right-0 z-10 mt-1 w-52 rounded border border-ink-300 bg-paper-1 shadow-note"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setMenuOpenId(null);
                  actionsTriggerRefs.current[study.id]?.focus();
                }
              }}
            >
              <button
                type="button"
                onClick={() => { router.push(`/studies/${study.id}`); setMenuOpenId(null); }}
                className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2"
              >
                View Details
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pending) return;
                  sessionStorage.setItem('prefillStudyConfig', JSON.stringify(study.config));
                  router.push(`/setup?prefill=edit&studyId=${study.id}`);
                  setMenuOpenId(null);
                }}
                disabled={pending}
                className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Edit &amp; Generate Link
              </button>
              {hasProjects && !pending && (
                <button
                  type="button"
                  onClick={() => { setMoveStudyId(study.id); setMenuOpenId(null); }}
                  className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2"
                >
                  Move to Project…
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(study.id)}
                disabled={pending || deletingId === study.id || (!pending && study.interviewCount > 0)}
                className="block w-full px-3 py-2 text-left text-[13px] text-error hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  // Project accordion header row (spans all columns)
  const renderProjectHeader = (project: StoredProject, studyCount: number) => {
    const isCollapsed = collapsed.has(project.id);
    const isEditing = editingProjectId === project.id;
    return (
      <tr key={`project-${project.id}`} className="border-b border-ink-300 bg-paper-2">
        <td colSpan={6} className="px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Toggle button */}
            <button
              type="button"
              onClick={() => toggleCollapse(project.id)}
              aria-label={isCollapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[11px] text-ink-500 hover:bg-paper-pop hover:text-ink-900"
            >
              {isCollapsed ? '▶' : '▼'}
            </button>

            {/* Project name — editable or display */}
            {isEditing ? (
              <input
                ref={renameInputRef}
                type="text"
                value={editingProjectName}
                onChange={e => setEditingProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void commitRename();
                  if (e.key === 'Escape') setEditingProjectId(null);
                }}
                onBlur={() => void commitRename()}
                maxLength={200}
                className="flex-1 rounded border border-action bg-paper-pop px-2 py-0.5 text-[14px] font-medium text-ink-900 outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => toggleCollapse(project.id)}
                className="text-left text-[14px] font-semibold text-ink-900"
              >
                {project.name}
              </button>
            )}

            <span className="text-[12px] text-ink-400">
              {studyCount} {studyCount === 1 ? 'study' : 'studies'}
            </span>

            {/* Project actions (right-aligned) */}
            {!isEditing && (
              <div className="ml-auto flex items-center gap-1">
                {/* + Study */}
                <button
                  type="button"
                  onClick={() => router.push('/setup')}
                  className="rounded-full border border-ink-300 px-3 py-0.5 text-[12px] text-ink-700 hover:bg-paper-pop hover:text-ink-900"
                >
                  + Study
                </button>

                {/* ··· menu */}
                <div className="relative">
                  <button
                    type="button"
                    data-dropdown-trigger
                    ref={(el) => { projectMenuTriggerRefs.current[project.id] = el; }}
                    onClick={() => setProjectMenuOpenId(projectMenuOpenId === project.id ? null : project.id)}
                    aria-label={`More options for ${project.name}`}
                    aria-haspopup="menu"
                    aria-expanded={projectMenuOpenId === project.id}
                    className="flex h-6 w-8 items-center justify-center rounded-full border border-ink-300 text-[14px] leading-none text-ink-500 hover:bg-paper-pop hover:text-ink-900"
                  >
                    ···
                  </button>
                  {projectMenuOpenId === project.id && (
                    <div
                      data-dropdown
                      className="absolute right-0 z-10 mt-1 w-32 rounded border border-ink-300 bg-paper-1 shadow-note"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setProjectMenuOpenId(null);
                          projectMenuTriggerRefs.current[project.id]?.focus();
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => startRename(project)}
                        className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => { setProjectMenuOpenId(null); void handleDeleteProject(project); }}
                        className="block w-full px-3 py-2 text-left text-[13px] text-error hover:bg-paper-2"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Section header for uncategorized studies
  const renderUncategorizedHeader = () => {
    const isCollapsed = collapsed.has(UNCATEGORIZED_KEY);
    return (
      <tr key="uncategorized-header" className="border-b border-ink-300 bg-paper-2">
        <td colSpan={6} className="px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleCollapse(UNCATEGORIZED_KEY)}
              aria-label={isCollapsed ? 'Expand uncategorized' : 'Collapse uncategorized'}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[11px] text-ink-500 hover:bg-paper-pop hover:text-ink-900"
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
            <span className="text-[14px] font-semibold text-ink-700">Uncategorized</span>
            <span className="text-[12px] text-ink-400">
              {uncategorized.length} {uncategorized.length === 1 ? 'study' : 'studies'}
            </span>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-sans text-[24px] leading-[32px] font-semibold text-ink-900">My Research</h1>
          <p className="text-[13px] text-ink-500">
            {studies.length} {studies.length === 1 ? 'study' : 'studies'}
            {hasProjects && ` across ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="quiet"
            onClick={() => { setShowNewProjectForm(v => !v); setNewProjectName(''); }}
          >
            {showNewProjectForm ? 'Cancel' : 'New Project'}
          </Button>
          <Button type="button" variant="primary" onClick={() => router.push('/setup')}>
            Create Study
          </Button>
          {hasSampleData ? (
            <Button type="button" variant="quiet" onClick={() => void handleClearSample()} disabled={loadingSample}>
              Clear Sample
            </Button>
          ) : (
            <Button
              type="button"
              variant="quiet"
              onClick={() => void handleLoadSample()}
              disabled={loadingSample || !!kvWarning}
            >
              Load Sample
            </Button>
          )}
        </div>
      </div>

      {/* New Project inline form */}
      {showNewProjectForm && (
        <div className="mt-4 flex items-center gap-2 rounded border border-action bg-paper-1 px-4 py-3">
          <input
            ref={newProjectInputRef}
            type="text"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleCreateProject();
              if (e.key === 'Escape') { setShowNewProjectForm(false); setNewProjectName(''); }
            }}
            placeholder="Project name…"
            maxLength={200}
            className="flex-1 bg-transparent text-[14px] text-ink-900 placeholder-ink-400 outline-none"
          />
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleCreateProject()}
            disabled={creatingProject || !newProjectName.trim()}
          >
            {creatingProject ? 'Creating…' : 'Create'}
          </Button>
        </div>
      )}

      <Rule className="my-6" />

      {/* Status banners */}
      {kvWarning && (
        <div className="mb-6 border-l-2 border-error bg-paper-2 px-4 py-3">
          <Label>
            {kvWarning.toLowerCase().includes('unavailable') ? 'Workspace unavailable' : 'Storage Not Configured'}
          </Label>
          <p className="mt-1 text-[13px] text-ink-700">{kvWarning}</p>
          {!kvWarning.toLowerCase().includes('unavailable') && (
            <p className="mt-1 text-[13px] text-ink-700">
              See the README for setup instructions using Upstash Redis.
            </p>
          )}
        </div>
      )}

      {operationNotice && (
        <div role="status" className="mb-6 border-l-2 border-error bg-paper-2 px-4 py-3">
          <Label>Pending reconciliation</Label>
          <p className="mt-1 text-[13px] text-ink-700">{operationNotice}</p>
          {hostedMode && (
            <Button
              type="button"
              variant="quiet"
              onClick={() => void runReconciliation()}
              disabled={isReconciling}
              className="mt-2"
            >
              Reconcile
            </Button>
          )}
        </div>
      )}

      {sampleMessage && (
        <div
          className={`mb-6 flex items-start gap-3 border-l-2 bg-paper-2 px-4 py-3 ${
            sampleMessage.type === 'success' ? 'border-success' : 'border-error'
          }`}
        >
          <p className="flex-1 text-[13px] text-ink-700">{sampleMessage.text}</p>
          <button
            type="button"
            onClick={() => setSampleMessage(null)}
            aria-label="Dismiss message"
            className="text-ink-500 hover:text-ink-900"
          >
            ×
          </button>
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <p className="text-[13px] text-ink-500">Loading…</p>
      ) : studies.length === 0 && !hasProjects ? (
        <Measure>
          <h2 className="font-sans text-[18px] font-semibold text-ink-900">
            {kvWarning ? 'Workspace unavailable' : 'No Studies Yet'}
          </h2>
          <p className="mt-2 text-[15px] text-ink-700">
            {kvWarning ? kvWarning : 'Create your first study or load a synthetic sample workspace.'}
          </p>
          <div className="mt-4 flex items-center gap-4">
            {!kvWarning && (
              <Button type="button" variant="primary" onClick={() => router.push('/setup')}>
                Create Study
              </Button>
            )}
            {!kvWarning && (
              <Button type="button" variant="quiet" onClick={() => void handleLoadSample()} disabled={loadingSample}>
                Load Sample
              </Button>
            )}
          </div>
          {!kvWarning && (
            <p className="mt-4 text-[13px] text-ink-500">
              The sample writes one fictional study, 3 completed interviews, and scripted analysis to your configured storage.
            </p>
          )}
        </Measure>
      ) : (
        <div className="min-h-[65vh]">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-300">
                <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  {hasProjects ? 'Project / Study' : 'Study'}
                </th>
                <th scope="col" className="w-24 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  Interviews
                </th>
                <th
                  scope="col"
                  className="hidden w-32 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:table-cell"
                >
                  Created
                </th>
                <th
                  scope="col"
                  className="hidden w-24 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:table-cell"
                >
                  Questions
                </th>
                <th scope="col" className="w-24 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  Status
                </th>
                <th scope="col" className="w-20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody onKeyDown={handleTbodyKeyDown}>
              {hasProjects ? (
                // Accordion view: projects as primary rows, studies as secondary rows
                <>
                  {projectGroups.map(({ project, studies: pStudies }) => (
                    <Fragment key={project.id}>
                      {renderProjectHeader(project, pStudies.length)}
                      {!collapsed.has(project.id) && (
                        pStudies.length === 0 ? (
                          <tr className="border-b border-ink-200">
                            <td colSpan={6} className="px-10 py-3 text-[13px] text-ink-400 italic">
                              No studies in this project yet.
                            </td>
                          </tr>
                        ) : (
                          pStudies.map(s => renderStudyRow(s, true))
                        )
                      )}
                    </Fragment>
                  ))}
                  {/* Uncategorized section */}
                  {uncategorized.length > 0 && (
                    <Fragment key={UNCATEGORIZED_KEY}>
                      {renderUncategorizedHeader()}
                      {!collapsed.has(UNCATEGORIZED_KEY) &&
                        uncategorized.map(s => renderStudyRow(s, true))
                      }
                    </Fragment>
                  )}
                </>
              ) : (
                // Flat view: no projects, just studies
                studies.map(s => renderStudyRow(s, false))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Move to Project modal */}
      {moveStudyId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50"
          onClick={() => setMoveStudyId(null)}
        >
          <div
            className="w-full max-w-sm rounded border border-ink-300 bg-paper-1 p-6 shadow-note"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-1 font-sans text-[16px] font-semibold text-ink-900">Move to Project</h3>
            <p className="mb-4 line-clamp-1 text-[13px] text-ink-500">{moveStudyName}</p>
            <div className="flex flex-col gap-1">
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleMoveStudy(p.id)}
                  disabled={movingStudy || p.id === moveStudyCurrentProjectId}
                  className="flex items-center justify-between rounded px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2 disabled:cursor-default disabled:opacity-50"
                >
                  <span>{p.name}</span>
                  {p.id === moveStudyCurrentProjectId && (
                    <span className="text-[11px] text-ink-400">current</span>
                  )}
                </button>
              ))}
              {moveStudyCurrentProjectId && (
                <button
                  type="button"
                  onClick={() => void handleMoveStudy(null)}
                  disabled={movingStudy}
                  className="rounded px-3 py-2 text-left text-[13px] text-ink-500 hover:bg-paper-2 disabled:opacity-50"
                >
                  Remove from project
                </button>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="quiet" onClick={() => setMoveStudyId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
