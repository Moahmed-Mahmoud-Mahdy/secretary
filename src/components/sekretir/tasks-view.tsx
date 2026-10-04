'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Square,
  Timer,
  Trash2,
  AlarmClock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyRobot } from '@/components/sekretir/empty-robot';
import {
  apiErrorMessage,
  endpoints,
  isAuthError,
  type Priority,
  type Recurrence,
  type TaskDTO,
} from '@/lib/sekretir/api';
import { PRIORITY_META, PRIORITY_OPTIONS, RECURRENCE_OPTIONS, RECURRENCE_LABELS } from '@/lib/sekretir/constants';
import {
  buildIso,
  fmtDeadline,
  fromLocalInputValue,
  relativeDay,
  todayKey,
  toLocalInputValue,
} from '@/lib/sekretir/date-utils';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'today' | 'overdue' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'today', label: 'النهارده' },
  { id: 'overdue', label: 'متأخرة' },
  { id: 'done', label: 'خلصت' },
];

const PRIORITY_ORDER: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Arabic minutes/hours formatter for tracked durations. */
function fmtMinutes(total: number): string {
  if (total < 60) return `${total} د`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} سا` : `${h} سا ${m} د`;
}

function trackingMinutes(task: TaskDTO): number {
  if (!task.trackingStartedAt) return task.actualMinutes;
  const elapsed = Math.floor((Date.now() - new Date(task.trackingStartedAt).getTime()) / 60_000);
  return task.actualMinutes + Math.max(0, elapsed);
}

function sortTasks(tasks: TaskDTO[]): TaskDTO[] {
  return [...tasks].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const da = a.deadline ?? '9999';
    const db = b.deadline ?? '9999';
    if (da !== db) return da < db ? -1 : 1;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

interface TasksViewProps {
  refreshKey: number;
  onAuthError: () => void;
}

export function TasksView({ refreshKey, onAuthError }: TasksViewProps) {
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  // live tick so tracking timers update every 30s
  const [, setTick] = useState(0);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  // quick add
  const [quickTitle, setQuickTitle] = useState('');
  const [quickTime, setQuickTime] = useState('');
  const [adding, setAdding] = useState(false);

  // expanded task ids
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subtaskDraft, setSubtaskDraft] = useState<Record<string, string>>({});
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);

  // edit dialog
  const [editTask, setEditTask] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    priority: 'MEDIUM' as Priority,
    deadline: '',
    estimatedMinutes: '',
    description: '',
    recurrence: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // delete dialog
  const [deleteTask, setDeleteTask] = useState<TaskDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { tasks: t } = await endpoints.tasks();
      setTasks(t);
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => {
    const today = todayKey();
    let list = tasks;
    if (filter === 'done') list = list.filter((t) => t.status === 'COMPLETED');
    else {
      list = list.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
      if (filter === 'overdue') list = list.filter((t) => t.isOverdue);
      if (filter === 'today') list = list.filter((t) => t.deadline?.slice(0, 10) === today);
    }
    return sortTasks(list);
  }, [tasks, filter]);

  // Per-filter counts shown inside the filter chips
  const filterCounts = useMemo(() => {
    const today = todayKey();
    const active = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
    return {
      all: tasks.length,
      today: active.filter((t) => t.deadline?.slice(0, 10) === today).length,
      overdue: active.filter((t) => t.isOverdue).length,
      done: tasks.filter((t) => t.status === 'COMPLETED').length,
    } as Record<Filter, number>;
  }, [tasks]);

  function upsert(updated: TaskDTO) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === updated.id) return { ...updated, subtasks: updated.subtasks ?? t.subtasks };
        // subtask update → patch parent
        if (t.subtasks?.some((s) => s.id === updated.id)) {
          return { ...t, subtasks: t.subtasks.map((s) => (s.id === updated.id ? updated : s)) };
        }
        return t;
      })
    );
  }

  async function toggleTask(task: TaskDTO) {
    const completing = task.status !== 'COMPLETED';
    // optimistic
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: completing ? 'COMPLETED' : 'TODO',
              completedAt: completing ? new Date().toISOString() : null,
            }
          : t
      )
    );
    try {
      const { task: updated } = await endpoints.updateTask(task.id, {
        status: completing ? 'COMPLETED' : 'TODO',
      });
      upsert(updated);
      if (completing) toast.success('برافو! ✅');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      upsert(task);
    }
  }

  async function quickAdd() {
    const title = quickTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const deadline = quickTime ? buildIso(todayKey(), quickTime) : null;
      const { task } = await endpoints.createTask({ title, deadline });
      setTasks((prev) => [...prev, task]);
      setQuickTitle('');
      setQuickTime('');
      toast.success('ضفتها ✅');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setAdding(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSubtask(parent: TaskDTO) {
    const title = (subtaskDraft[parent.id] ?? '').trim();
    if (!title || addingSubtaskFor === parent.id) return;
    setAddingSubtaskFor(parent.id);
    try {
      await endpoints.createTask({ title, parentId: parent.id });
      await load();
      setSubtaskDraft((prev) => ({ ...prev, [parent.id]: '' }));
      setExpanded((prev) => new Set(prev).add(parent.id));
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setAddingSubtaskFor(null);
    }
  }

  async function toggleSubtask(sub: TaskDTO) {
    const completing = sub.status !== 'COMPLETED';
    try {
      const { task: updated } = await endpoints.updateTask(sub.id, {
        status: completing ? 'COMPLETED' : 'TODO',
      });
      upsert(updated);
      if (completing) toast.success('برافو! ✅');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  async function toggleTracking(task: TaskDTO) {
    if (trackingId) return;
    setTrackingId(task.id);
    try {
      const stopping = task.isTracking;
      const { task: updated } = await endpoints.trackTask(task.id, stopping ? 'stop' : 'start');
      upsert(updated);
      toast.success(stopping ? `اتسجل ${fmtMinutes(updated.actualMinutes)} شغل 👏` : 'يلا بينا… سجّل وقتك ⏱');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setTrackingId(null);
    }
  }

  function openEdit(task: TaskDTO) {
    setEditForm({
      title: task.title,
      priority: task.priority,
      deadline: toLocalInputValue(task.deadline),
      estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : '',
      description: task.description ?? '',
      recurrence: task.recurrence ?? '',
    });
    setEditTask(task);
  }

  async function saveEdit() {
    if (!editTask || savingEdit) return;
    if (!editForm.title.trim()) {
      toast.error('العنوان مينفعش يكون فاضي');
      return;
    }
    setSavingEdit(true);
    try {
      const { task: updated } = await endpoints.updateTask(editTask.id, {
        title: editForm.title.trim(),
        priority: editForm.priority,
        deadline: fromLocalInputValue(editForm.deadline),
        estimatedMinutes: editForm.estimatedMinutes ? Number(editForm.estimatedMinutes) : null,
        description: editForm.description.trim() || null,
        recurrence:
          editForm.recurrence && editForm.recurrence !== 'none'
            ? (editForm.recurrence as Recurrence)
            : null,
      });
      upsert(updated);
      setEditTask(null);
      toast.success('اتعدلت ✅');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTask || deleting) return;
    setDeleting(true);
    try {
      await endpoints.deleteTask(deleteTask.id);
      setTasks((prev) => prev.filter((t) => t.id !== deleteTask.id));
      setDeleteTask(null);
      toast.success('تمسحت ✅');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-extrabold text-stone-900">المهام</h1>
        <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="فلترة المهام">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95',
                filter === f.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white border border-stone-200 text-stone-500 hover:bg-stone-100'
              )}
            >
              {f.label}
              {filterCounts[f.id] > 0 ? (
                <span
                  className={cn(
                    'ms-1 tabular-nums text-[10px]',
                    filter === f.id ? 'text-amber-100' : 'text-stone-400'
                  )}
                >
                  {filterCounts[f.id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Quick add */}
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') quickAdd();
              }}
              placeholder="ضيف مهمة سريعة... مثلاً: أذاكر ساعة"
              className="border-0 shadow-none focus-visible:ring-0 text-sm bg-transparent"
              aria-label="عنوان المهمة الجديدة"
            />
            <Input
              type="time"
              value={quickTime}
              onChange={(e) => setQuickTime(e.target.value)}
              className="w-28 shrink-0 text-sm"
              aria-label="معاد اختياري النهارده"
            />
            <Button
              size="icon"
              onClick={quickAdd}
              disabled={adding || !quickTitle.trim()}
              className="size-9 rounded-full bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              aria-label="ضيف المهمة"
            >
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-4">
            <EmptyRobot
              title="مفيش مهام لسه"
              hint="قولي عايز تعمل إيه وأنا أظبطها لك 😄"
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((task, idx) => {
            const done = task.status === 'COMPLETED';
            const isOpen = expanded.has(task.id);
            return (
              <li key={task.id} className="sekretir-rise" style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}>
                <Card
                  className={cn(
                    'relative overflow-hidden bg-white border rounded-2xl shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                    task.isTracking && 'border-emerald-300 ring-1 ring-emerald-100',
                    !task.isTracking && (task.isOverdue ? 'border-rose-200' : 'border-stone-200')
                  )}
                >
                  {/* Priority edge strip (start side) */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-2 start-0 w-1 rounded-full',
                      done
                        ? 'bg-emerald-400/70'
                        : task.isOverdue && task.priority !== 'URGENT'
                          ? 'bg-rose-400'
                          : PRIORITY_META[task.priority].dot
                    )}
                  />
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={done}
                        onCheckedChange={() => toggleTask(task)}
                        className="mt-1 size-5 shrink-0 transition-transform active:scale-90 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:animate-check-pop"
                        aria-label={done ? 'ارجع المهمة' : 'خلصت المهمة'}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            'font-semibold text-sm sm:text-base break-words',
                            done ? 'line-through text-stone-400' : 'text-stone-800'
                          )}
                        >
                          {task.title}
                        </p>

                        {task.description ? (
                          <p className="text-xs text-stone-500 mt-1 line-clamp-2">{task.description}</p>
                        ) : null}

                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full',
                              PRIORITY_META[task.priority].badge
                            )}
                          >
                            {PRIORITY_META[task.priority].label}
                          </span>
                          {task.projectName ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                              📁 {task.projectName}
                            </span>
                          ) : null}
                          {task.estimatedMinutes ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 tabular-nums">
                              ⏱ {task.estimatedMinutes}د
                            </span>
                          ) : null}
                          {task.actualMinutes > 0 && !task.isTracking ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 tabular-nums">
                              ⏱ فعلي {fmtMinutes(task.actualMinutes)}
                            </span>
                          ) : null}
                          {task.isTracking ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 tabular-nums inline-flex items-center gap-1.5">
                              <span className="size-1.5 rounded-full bg-emerald-500 sekretir-live-dot" aria-hidden />
                              شغّال {fmtMinutes(trackingMinutes(task))}
                            </span>
                          ) : null}
                          {task.deadline ? (
                            <span
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums',
                                task.isOverdue && !done
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-stone-100 text-stone-600'
                              )}
                            >
                              ⏰ {fmtDeadline(task.deadline)}
                            </span>
                          ) : null}
                          {task.recurrence ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                              🔁 {RECURRENCE_LABELS[task.recurrence]}
                            </span>
                          ) : null}
                        </div>

                        {task.subtasks && task.subtasks.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(task.id)}
                            className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
                            aria-expanded={isOpen}
                          >
                            <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                            مهام فرعية ({task.subtasks.length})
                          </button>
                        ) : null}

                        {/* Subtasks */}
                        {isOpen ? (
                          <div className="mt-2 ps-3 border-s-2 border-stone-100 space-y-1.5">
                            {task.subtasks.map((sub) => {
                              const subDone = sub.status === 'COMPLETED';
                              return (
                                <div key={sub.id} className="flex items-center gap-2">
                                  <Checkbox
                                    checked={subDone}
                                    onCheckedChange={() => toggleSubtask(sub)}
                                    className="size-4 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                    aria-label={subDone ? 'ارجع المهمة الفرعية' : 'خلصت المهمة الفرعية'}
                                  />
                                  <span
                                    className={cn(
                                      'text-xs',
                                      subDone ? 'line-through text-stone-400' : 'text-stone-700'
                                    )}
                                  >
                                    {sub.title}
                                  </span>
                                </div>
                              );
                            })}
                            <div className="flex items-center gap-1.5 pt-1">
                              <Input
                                value={subtaskDraft[task.id] ?? ''}
                                onChange={(e) =>
                                  setSubtaskDraft((prev) => ({ ...prev, [task.id]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addSubtask(task);
                                }}
                                placeholder="ضيف مهمة فرعية..."
                                className="h-7 text-xs bg-stone-50"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-amber-700 hover:bg-amber-50"
                                onClick={() => addSubtask(task)}
                                disabled={addingSubtaskFor === task.id || !(subtaskDraft[task.id] ?? '').trim()}
                                aria-label="ضيف المهمة الفرعية"
                              >
                                {addingSubtaskFor === task.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Plus className="size-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {task.subtasks?.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(task.id)}
                            className="mt-2 text-xs font-semibold text-stone-400 hover:text-amber-700 flex items-center gap-1"
                            aria-expanded={isOpen}
                          >
                            <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                            ضيف مهام فرعية
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {!done ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'size-8 transition-colors',
                              task.isTracking
                                ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                : 'text-stone-400 hover:text-amber-700 hover:bg-amber-50'
                            )}
                            onClick={() => toggleTracking(task)}
                            disabled={trackingId === task.id}
                            aria-label={task.isTracking ? 'وقّف تسجيل الوقت' : 'سجّل وقت شغلك'}
                            title={task.isTracking ? 'وقّف التسجيل' : 'ابدأ تسجيل الوقت'}
                          >
                            {trackingId === task.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : task.isTracking ? (
                              <Square className="size-4" />
                            ) : (
                              <Play className="size-4" />
                            )}
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0 text-stone-400 hover:text-stone-700"
                              aria-label="خيارات المهمة"
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => openEdit(task)}>
                            <Pencil className="size-4" />
                            تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTask(task)}
                            className="text-rose-600 focus:text-rose-700"
                          >
                            <Trash2 className="size-4" />
                            امسح
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Edit dialog */}
      <Dialog open={editTask !== null} onOpenChange={(o) => !o && setEditTask(null)}>
        <DialogContent className="rounded-2xl max-h-[90dvh] overflow-y-auto sekretir-scroll">
          <DialogHeader>
            <DialogTitle>عدّل المهمة ✏️</DialogTitle>
            <DialogDescription>غيّر اللي عايزه واحفظ.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="edit-title">العنوان</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>الأولوية</Label>
                <Select
                  value={editForm.priority}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v as Priority }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-estimated">التقدير (بالدقايق)</Label>
                <Input
                  id="edit-estimated"
                  type="number"
                  min={5}
                  step={5}
                  dir="ltr"
                  value={editForm.estimatedMinutes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, estimatedMinutes: e.target.value }))
                  }
                  placeholder="مثلاً 60"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deadline">الموعد النهائي</Label>
              <Input
                id="edit-deadline"
                type="datetime-local"
                dir="ltr"
                value={editForm.deadline}
                onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>التكرار</Label>
              <Select
                value={editForm.recurrence}
                onValueChange={(v) => setEditForm((f) => ({ ...f, recurrence: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="من غير تكرار" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">من غير تكرار</SelectItem>
                  {RECURRENCE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      🔁 {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">وصف</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="تفاصيل إضافية (اختياري)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTask(null)}>
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={saveEdit}
              disabled={savingEdit}
            >
              {savingEdit ? <Loader2 className="size-4 animate-spin" /> : <Timer className="size-4" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteTask !== null} onOpenChange={(o) => !o && setDeleteTask(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تمسح المهمة دي؟ 🗑️</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTask?.title}» هتتمسح خالص ومش هترجع تاني.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>سيبها</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <AlarmClock className="size-4" />}
              امسح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
