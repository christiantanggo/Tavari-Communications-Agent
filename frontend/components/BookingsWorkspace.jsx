'use client';

import { useEffect, useMemo, useState } from 'react';
import api, { bookingsAPI as namedBookingsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

const DEFAULT_SETTINGS = {
  enabled: true,
  slot_duration_minutes: 30,
  allowed_durations_minutes: [30, 60, 90, 120, 150, 180, 210, 240],
  capacity_per_slot: 1,
  minimum_notice_minutes: 60,
  max_days_ahead: 30,
  duplicate_window_minutes: 180,
  require_confirmation_for_duplicates: true,
  ask_for_email: true,
  require_reason: false,
};

const bookingsAPI = namedBookingsAPI || {
  getSettings: () => api.get('/bookings/settings'),
  updateSettings: (data) => api.put('/bookings/settings', data),
  getSlots: (params) => api.get('/bookings/slots', { params }),
  getCalendar: (params) => api.get('/bookings/calendar', { params }),
  listBlocks: (params) => api.get('/bookings/blocks', { params }),
  createBlock: (data) => api.post('/bookings/blocks', data),
  updateBlock: (blockId, data) => api.put(`/bookings/blocks/${blockId}`, data),
  deleteBlock: (blockId) => api.delete(`/bookings/blocks/${blockId}`),
  list: (params) => api.get('/bookings', { params }),
  get: (bookingId) => api.get(`/bookings/${bookingId}`),
  create: (data) => api.post('/bookings', data),
  update: (bookingId, data) => api.put(`/bookings/${bookingId}`, data),
  confirm: (bookingId) => api.post(`/bookings/${bookingId}/confirm`),
  cancel: (bookingId, cancel_reason) => api.post(`/bookings/${bookingId}/cancel`, { cancel_reason }),
  reschedule: (bookingId, data) => api.post(`/bookings/${bookingId}/reschedule`, data),
};

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseCsvNumbers(value, fallback = []) {
  const nums = String(value || '')
    .split(',')
    .map((part) => parseInt(part.trim(), 10))
    .filter((num) => Number.isFinite(num) && num > 0);
  return nums.length ? Array.from(new Set(nums)).sort((a, b) => a - b) : fallback;
}

function formatLocalDate(dateInput, timezone) {
  return new Date(dateInput).toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toInputDateTime(iso, timezone) {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const timePart = date.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date: datePart, time: timePart };
}

function statusClasses(status) {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'scheduled':
      return 'bg-yellow-100 text-yellow-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'completed':
      return 'bg-blue-100 text-blue-800';
    case 'no_show':
      return 'bg-gray-200 text-gray-700';
    case 'rescheduled':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function emptyBookingForm(selectedDate, duration) {
  return {
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    reason: '',
    notes: '',
    date: selectedDate,
    start_time: '09:00',
    duration_minutes: duration || 30,
  };
}

function emptyBlockForm(selectedDate) {
  return {
    type: 'blocked',
    title: 'Blocked',
    date: selectedDate,
    start_time: '09:00',
    end_time: '10:00',
    notes: '',
    all_day: false,
  };
}

export default function BookingsWorkspace({ topContent = null }) {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [timezone, setTimezone] = useState('America/New_York');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsDurationCsv, setSettingsDurationCsv] = useState('30, 60, 90, 120, 150, 180, 210, 240');
  /** Bumped after each actions-dropdown pick so the native select resets to the placeholder. */
  const [bookingActionMenuKey, setBookingActionMenuKey] = useState({});
  const [bookings, setBookings] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [calendarBookings, setCalendarBookings] = useState([]);
  const [calendarBlocks, setCalendarBlocks] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [availableSlots, setAvailableSlots] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [bookingMode, setBookingMode] = useState('create');
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [bookingForm, setBookingForm] = useState(emptyBookingForm(dateKey(), 30));
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [blockForm, setBlockForm] = useState(emptyBlockForm(dateKey()));
  const [showBlockForm, setShowBlockForm] = useState(false);

  const loadSettings = async () => {
    const res = await bookingsAPI.getSettings();
    const { availability_rules: _legacyAvailabilityRules, ...loadedSettings } = res.data?.settings || {};
    const loaded = { ...DEFAULT_SETTINGS, ...loadedSettings };
    setSettings(loaded);
    setSettingsDurationCsv((loaded.allowed_durations_minutes || [loaded.slot_duration_minutes]).join(', '));
  };

  const loadBookings = async () => {
    const res = await bookingsAPI.list({
      status: statusFilter || undefined,
      search: search || undefined,
      limit: 500,
    });
    setBookings(res.data?.bookings || []);
    setTimezone(res.data?.timezone || 'America/New_York');
  };

  const loadCalendar = async (month = selectedMonth) => {
    const res = await bookingsAPI.getCalendar({ month });
    setCalendarBookings(res.data?.bookings || []);
    setCalendarBlocks(res.data?.blocks || []);
  };

  const loadBlocks = async () => {
    const res = await bookingsAPI.listBlocks();
    setBlocks(res.data?.blocks || []);
  };

  const loadSlots = async (date = selectedDate, duration = bookingForm.duration_minutes || settings.slot_duration_minutes) => {
    if (!date) return;
    const res = await bookingsAPI.getSlots({ date, duration_minutes: duration });
    setAvailableSlots(res.data?.slots || []);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadSettings(), loadBookings(), loadCalendar(selectedMonth), loadBlocks()]);
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to load bookings workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    loadBookings().catch((error) => showError(error?.response?.data?.error || error.message || 'Failed to load bookings'));
  }, [statusFilter]);

  useEffect(() => {
    loadCalendar(selectedMonth).catch((error) => showError(error?.response?.data?.error || error.message || 'Failed to load calendar'));
  }, [selectedMonth]);

  useEffect(() => {
    loadSlots(selectedDate, bookingForm.duration_minutes).catch(() => {});
  }, [selectedDate, bookingForm.duration_minutes, settings.slot_duration_minutes]);

  const bookingsByDate = useMemo(() => {
    return calendarBookings.reduce((acc, booking) => {
      const key = toInputDateTime(booking.start_at, timezone).date;
      acc[key] = acc[key] || [];
      acc[key].push(booking);
      return acc;
    }, {});
  }, [calendarBookings, timezone]);

  const blocksByDate = useMemo(() => {
    return calendarBlocks.reduce((acc, block) => {
      const key = toInputDateTime(block.start_at, timezone).date;
      acc[key] = acc[key] || [];
      acc[key].push(block);
      return acc;
    }, {});
  }, [calendarBlocks, timezone]);

  const visibleBookings = useMemo(() => {
    return bookings.filter((booking) => {
      if (search) {
        const haystack = `${booking.customer_name} ${booking.customer_phone} ${booking.customer_email || ''} ${booking.reason || ''}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (statusFilter && booking.status !== statusFilter) return false;
      return true;
    });
  }, [bookings, search, statusFilter]);

  const selectedDayBookings = bookingsByDate[selectedDate] || [];
  const selectedDayBlocks = blocksByDate[selectedDate] || [];

  const openCreateBooking = (date = selectedDate, time = null) => {
    setBookingMode('create');
    setEditingBookingId(null);
    setBookingForm({
      ...emptyBookingForm(date, settings.slot_duration_minutes),
      start_time: time || '09:00',
    });
    setShowBookingForm(true);
  };

  const openEditBooking = (booking, mode = 'edit') => {
    const local = toInputDateTime(booking.start_at, timezone);
    setBookingMode(mode);
    setEditingBookingId(booking.id);
    setBookingForm({
      customer_name: booking.customer_name || '',
      customer_phone: booking.customer_phone || '',
      customer_email: booking.customer_email || '',
      reason: booking.reason || '',
      notes: booking.notes || '',
      date: local.date,
      start_time: local.time,
      duration_minutes: booking.duration_minutes || settings.slot_duration_minutes,
    });
    setSelectedDate(local.date);
    setShowBookingForm(true);
  };

  const openCreateBlock = (date = selectedDate) => {
    setEditingBlockId(null);
    setBlockForm(emptyBlockForm(date));
    setShowBlockForm(true);
  };

  const openEditBlock = (block) => {
    const local = toInputDateTime(block.start_at, timezone);
    const localEnd = toInputDateTime(block.end_at, timezone);
    setEditingBlockId(block.id);
    setBlockForm({
      type: block.type || 'blocked',
      title: block.title || 'Blocked',
      date: local.date,
      start_time: local.time,
      end_time: localEnd.time,
      notes: block.notes || '',
      all_day: block.all_day === true,
    });
    setSelectedDate(local.date);
    setShowBlockForm(true);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const { availability_rules: _legacyAvailabilityRulesForSave, ...payload } = {
        ...settings,
        allowed_durations_minutes: parseCsvNumbers(settingsDurationCsv, [settings.slot_duration_minutes]),
      };
      if (!payload.allowed_durations_minutes.includes(payload.slot_duration_minutes)) {
        payload.slot_duration_minutes = payload.allowed_durations_minutes[0];
      }
      const res = await bookingsAPI.updateSettings(payload);
      const { availability_rules: _legacyAvailabilityRulesFromResponse, ...updatedSettings } = res.data?.settings || payload;
      const updated = { ...DEFAULT_SETTINGS, ...updatedSettings };
      setSettings(updated);
      setSettingsDurationCsv(updated.allowed_durations_minutes.join(', '));
      success('Booking settings saved');
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to save booking settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleBookingSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...bookingForm,
        duration_minutes: parseInt(bookingForm.duration_minutes, 10) || settings.slot_duration_minutes,
        // Staff UI: allow times outside public slots (no AI agent hours, notice window, or capacity blocks).
        skip_availability_check: true,
      };
      if (bookingMode === 'edit' && editingBookingId) {
        await bookingsAPI.update(editingBookingId, payload);
        success('Booking updated');
      } else if (bookingMode === 'reschedule' && editingBookingId) {
        await bookingsAPI.reschedule(editingBookingId, payload);
        success('Booking rescheduled');
      } else {
        const res = await bookingsAPI.create(payload);
        if (res.data?.requires_confirmation) {
          success('Booking created and marked for confirmation');
        } else {
          success('Booking created');
        }
      }
      setShowBookingForm(false);
      await Promise.all([loadBookings(), loadCalendar(selectedMonth), loadBlocks(), loadSlots(payload.date, payload.duration_minutes)]);
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to save booking');
    }
  };

  const handleBlockSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        type: blockForm.type,
        title: blockForm.title,
        notes: blockForm.notes,
        all_day: blockForm.all_day,
        start_at: `${blockForm.date}T${blockForm.all_day ? '00:00' : blockForm.start_time}:00`,
        end_at: `${blockForm.date}T${blockForm.all_day ? '23:59' : blockForm.end_time}:00`,
      };
      if (editingBlockId) {
        await bookingsAPI.updateBlock(editingBlockId, payload);
        success('Block updated');
      } else {
        await bookingsAPI.createBlock(payload);
        success('Block created');
      }
      setShowBlockForm(false);
      await Promise.all([loadBlocks(), loadCalendar(selectedMonth), loadSlots(selectedDate)]);
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to save block');
    }
  };

  const handleQuickStatus = async (bookingId, status) => {
    try {
      await bookingsAPI.update(bookingId, { status });
      success(`Booking marked ${status.replace('_', ' ')}`);
      await Promise.all([loadBookings(), loadCalendar(selectedMonth)]);
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to update booking');
    }
  };

  const handleCancelBooking = async (bookingId) => {
    const reason = window.prompt('Cancel reason (optional):', '') || '';
    try {
      await bookingsAPI.cancel(bookingId, reason);
      success('Booking cancelled');
      await Promise.all([loadBookings(), loadCalendar(selectedMonth)]);
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to cancel booking');
    }
  };

  const handleConfirmBooking = async (bookingId) => {
    try {
      await bookingsAPI.confirm(bookingId);
      success('Booking confirmed');
      await Promise.all([loadBookings(), loadCalendar(selectedMonth)]);
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to confirm booking');
    }
  };

  const handleDeleteBlock = async (blockId) => {
    if (!window.confirm('Delete this block?')) return;
    try {
      await bookingsAPI.deleteBlock(blockId);
      success('Block deleted');
      await Promise.all([loadBlocks(), loadCalendar(selectedMonth), loadSlots(selectedDate)]);
    } catch (error) {
      showError(error?.response?.data?.error || error.message || 'Failed to delete block');
    }
  };

  const buildCalendarCells = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const firstWeekday = first.getDay();
    const lastDay = new Date(year, month, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= lastDay; day += 1) {
      cells.push(`${selectedMonth}-${String(day).padStart(2, '0')}`);
    }
    return cells;
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">Loading bookings workspace...</div>;
  }

  return (
    <div className="space-y-6">
      {topContent}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
            <p className="text-sm text-gray-500">Manage appointments, business-hours-based availability, and booking blocks.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openCreateBooking()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              New Booking
            </button>
            <button onClick={() => openCreateBlock()} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              New Block
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-6 py-3 sm:px-8">
          {[
            ['list', 'List View'],
            ['calendar', 'Calendar View'],
            ['blocks', 'Blocks'],
            ['settings', 'Settings'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'list' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by customer, phone, email, or reason"
                  className="min-w-[280px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-gray-300 px-4 py-2.5 text-sm">
                  <option value="">All statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                  <option value="no_show">No Show</option>
                  <option value="rescheduled">Rescheduled</option>
                </select>
                <button onClick={() => loadBookings()} className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[920px] table-auto divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 lg:px-6">Customer</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 lg:px-6">When</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 lg:px-6">Status</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 lg:px-6">Reason</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 lg:px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {visibleBookings.map((booking) => (
                      <tr key={booking.id} className="align-top">
                        <td className="px-5 py-4 align-top lg:px-6">
                          <div className="font-medium leading-snug text-gray-900">{booking.customer_name}</div>
                          <div className="mt-0.5 text-gray-500">{booking.customer_phone}</div>
                          {booking.customer_email && <div className="mt-0.5 break-all text-gray-500">{booking.customer_email}</div>}
                        </td>
                        <td className="px-5 py-4 align-top leading-relaxed text-gray-700 lg:px-6">{formatLocalDate(booking.start_at, timezone)}</td>
                        <td className="px-5 py-4 align-top lg:px-6">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(booking.status)}`}>
                            {booking.status.replace('_', ' ')}
                          </span>
                          {booking.requires_confirmation && <div className="mt-2 text-xs text-amber-700">Needs confirmation</div>}
                        </td>
                        <td className="min-w-[12rem] max-w-xl px-5 py-4 align-top leading-relaxed text-gray-700 lg:min-w-[16rem] lg:px-6">
                          <span className="block break-words">{booking.reason || '—'}</span>
                        </td>
                        <td className="w-[1%] whitespace-nowrap px-5 py-4 align-top lg:px-6">
                          <select
                            key={`booking-actions-${booking.id}-${bookingActionMenuKey[booking.id] || 0}`}
                            aria-label={`Actions for ${booking.customer_name || 'booking'}`}
                            className="min-w-[11rem] max-w-[14rem] rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            defaultValue=""
                            onChange={(e) => {
                              const action = e.target.value;
                              setBookingActionMenuKey((prev) => ({
                                ...prev,
                                [booking.id]: (prev[booking.id] || 0) + 1,
                              }));
                              if (!action) return;
                              if (action === 'confirm') handleConfirmBooking(booking.id);
                              else if (action === 'edit') openEditBooking(booking, 'edit');
                              else if (action === 'reschedule') openEditBooking(booking, 'reschedule');
                              else if (action === 'complete') handleQuickStatus(booking.id, 'completed');
                              else if (action === 'no_show') handleQuickStatus(booking.id, 'no_show');
                              else if (action === 'cancel') handleCancelBooking(booking.id);
                            }}
                          >
                            <option value="" disabled>
                              Choose action…
                            </option>
                            {booking.requires_confirmation && booking.status !== 'confirmed' && (
                              <option value="confirm">Confirm</option>
                            )}
                            <option value="edit">Edit</option>
                            <option value="reschedule">Reschedule</option>
                            <option value="complete">Mark complete</option>
                            <option value="no_show">Mark no-show</option>
                            <option value="cancel">Cancel booking</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                    {visibleBookings.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                          No bookings found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <button
                    onClick={() => {
                      const [year, month] = selectedMonth.split('-').map(Number);
                      setSelectedMonth(month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`);
                    }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h2>
                  <button
                    onClick={() => {
                      const [year, month] = selectedMonth.split('-').map(Number);
                      setSelectedMonth(month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`);
                    }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                    <div key={label} className="px-2 py-1">{label}</div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {buildCalendarCells().map((cell, index) => (
                    <button
                      key={cell || `empty-${index}`}
                      type="button"
                      disabled={!cell}
                      onClick={() => {
                        if (!cell) return;
                        setSelectedDate(cell);
                      }}
                      className={`min-h-[120px] rounded-xl border p-2 text-left ${!cell ? 'border-transparent bg-transparent' : selectedDate === cell ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50'}`}
                    >
                      {cell && (
                        <>
                          <div className="mb-2 text-sm font-semibold text-gray-900">{parseInt(cell.slice(-2), 10)}</div>
                          <div className="space-y-1">
                            {(bookingsByDate[cell] || []).slice(0, 3).map((booking) => (
                              <div key={booking.id} className="truncate rounded bg-green-100 px-2 py-1 text-[11px] text-green-800">
                                {booking.customer_name}
                              </div>
                            ))}
                            {(blocksByDate[cell] || []).slice(0, 2).map((block) => (
                              <div key={block.id} className="truncate rounded bg-red-100 px-2 py-1 text-[11px] text-red-800">
                                {block.title}
                              </div>
                            ))}
                            {(bookingsByDate[cell] || []).length > 3 && (
                              <div className="text-[11px] text-gray-500">+{(bookingsByDate[cell] || []).length - 3} more</div>
                            )}
                          </div>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selectedDate}</h3>
                    <p className="text-sm text-gray-500">Daily bookings, blocks, and open slots.</p>
                  </div>
                  <button onClick={() => openCreateBooking(selectedDate)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    New
                  </button>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-700">Bookings</h4>
                  <div className="space-y-2">
                    {selectedDayBookings.map((booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => openEditBooking(booking)}
                        className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-blue-200"
                      >
                        <div className="font-medium text-gray-900">{booking.customer_name}</div>
                        <div className="text-sm text-gray-500">{formatLocalDate(booking.start_at, timezone)}</div>
                      </button>
                    ))}
                    {selectedDayBookings.length === 0 && <p className="text-sm text-gray-500">No bookings on this day.</p>}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-700">Blocks</h4>
                  <div className="space-y-2">
                    {selectedDayBlocks.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => openEditBlock(block)}
                        className="w-full rounded-lg border border-red-200 bg-white p-3 text-left hover:border-red-300"
                      >
                        <div className="font-medium text-gray-900">{block.title}</div>
                        <div className="text-sm text-gray-500 capitalize">{block.type}</div>
                      </button>
                    ))}
                    {selectedDayBlocks.length === 0 && <p className="text-sm text-gray-500">No blocks on this day.</p>}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-700">Available Slots</h4>
                  <div className="space-y-2">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.start_at}
                        type="button"
                        onClick={() => openCreateBooking(slot.local_date, slot.local_time)}
                        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:border-blue-200"
                      >
                        <span className="text-sm font-medium text-gray-900">{slot.local_time}</span>
                        <span className="text-xs text-gray-500">{slot.capacity_remaining} left</span>
                      </button>
                    ))}
                    {availableSlots.length === 0 && <p className="text-sm text-gray-500">No open slots for this day.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'blocks' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => openCreateBlock()} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                  New Block
                </button>
              </div>
              <div className="space-y-3">
                {blocks.map((block) => (
                  <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
                    <div>
                      <div className="font-semibold text-gray-900">{block.title}</div>
                      <div className="text-sm text-gray-500 capitalize">{block.type}</div>
                      <div className="text-sm text-gray-500">{formatLocalDate(block.start_at, timezone)} to {formatLocalDate(block.end_at, timezone)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEditBlock(block)} className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200">Edit</button>
                      <button onClick={() => handleDeleteBlock(block.id)} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100">Delete</button>
                    </div>
                  </div>
                ))}
                {blocks.length === 0 && <p className="text-sm text-gray-500">No blocks created yet.</p>}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-8">
              <div className="flex justify-end">
                <button onClick={handleSaveSettings} disabled={savingSettings} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {savingSettings ? 'Saving...' : 'Save Booking Settings'}
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-900">General</h3>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                    Booking availability uses your main business hours and holiday hours from Settings. Use booking blocks for lunch, meetings, closures, vacations, and other exceptions.
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                    Booking confirmations and reminders are controlled from the main app Notifications settings.
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
                    Allow the system to accept bookings
                  </label>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Allowed durations (minutes, comma separated)</label>
                    <input value={settingsDurationCsv} onChange={(e) => setSettingsDurationCsv(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Default duration</label>
                    <select
                      value={settings.slot_duration_minutes}
                      onChange={(e) => setSettings({ ...settings, slot_duration_minutes: parseInt(e.target.value, 10) })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {parseCsvNumbers(settingsDurationCsv, [settings.slot_duration_minutes]).map((duration) => (
                        <option key={duration} value={duration}>{duration} minutes</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Bookings per slot</label>
                      <input type="number" min="1" value={settings.capacity_per_slot} onChange={(e) => setSettings({ ...settings, capacity_per_slot: parseInt(e.target.value, 10) || 1 })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Minimum notice (minutes)</label>
                      <input type="number" min="0" value={settings.minimum_notice_minutes} onChange={(e) => setSettings({ ...settings, minimum_notice_minutes: parseInt(e.target.value, 10) || 0 })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Maximum days ahead</label>
                      <input type="number" min="1" value={settings.max_days_ahead} onChange={(e) => setSettings({ ...settings, max_days_ahead: parseInt(e.target.value, 10) || 30 })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Duplicate window (minutes)</label>
                      <input type="number" min="0" value={settings.duplicate_window_minutes} onChange={(e) => setSettings({ ...settings, duplicate_window_minutes: parseInt(e.target.value, 10) || 0 })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={settings.require_confirmation_for_duplicates} onChange={(e) => setSettings({ ...settings, require_confirmation_for_duplicates: e.target.checked })} />
                    Duplicate bookings require confirmation
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={settings.ask_for_email} onChange={(e) => setSettings({ ...settings, ask_for_email: e.target.checked })} />
                    Ask the caller for email when possible
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={settings.require_reason} onChange={(e) => setSettings({ ...settings, require_reason: e.target.checked })} />
                    Require a booking reason
                  </label>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {showBookingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleBookingSubmit} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {bookingMode === 'create' ? 'New Booking' : bookingMode === 'reschedule' ? 'Reschedule Booking' : 'Edit Booking'}
              </h2>
              <button type="button" onClick={() => setShowBookingForm(false)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Customer name</label>
                <input value={bookingForm.customer_name} onChange={(e) => setBookingForm({ ...bookingForm, customer_name: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Customer phone</label>
                <input value={bookingForm.customer_phone} onChange={(e) => setBookingForm({ ...bookingForm, customer_phone: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Customer email</label>
                <input value={bookingForm.customer_email} onChange={(e) => setBookingForm({ ...bookingForm, customer_email: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Duration</label>
                <select value={bookingForm.duration_minutes} onChange={(e) => setBookingForm({ ...bookingForm, duration_minutes: parseInt(e.target.value, 10) })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  {(settings.allowed_durations_minutes || [settings.slot_duration_minutes]).map((duration) => (
                    <option key={duration} value={duration}>{duration} minutes</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                <input type="date" value={bookingForm.date} onChange={(e) => { setBookingForm({ ...bookingForm, date: e.target.value }); setSelectedDate(e.target.value); }} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Start time</label>
                <input type="time" step="1800" value={bookingForm.start_time} onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
                <input value={bookingForm.reason} onChange={(e) => setBookingForm({ ...bookingForm, reason: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea value={bookingForm.notes} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowBookingForm(false)} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancel</button>
              <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {bookingMode === 'create' ? 'Create Booking' : bookingMode === 'reschedule' ? 'Reschedule Booking' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBlockForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleBlockSubmit} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{editingBlockId ? 'Edit Block' : 'New Block'}</h2>
              <button type="button" onClick={() => setShowBlockForm(false)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                <select value={blockForm.type} onChange={(e) => setBlockForm({ ...blockForm, type: e.target.value, title: blockForm.title || e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  {['lunch', 'meeting', 'closure', 'vacation', 'emergency', 'blocked'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input value={blockForm.title} onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                <input type="date" value={blockForm.date} onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div className="flex items-center gap-2 pt-7">
                <input type="checkbox" checked={blockForm.all_day} onChange={(e) => setBlockForm({ ...blockForm, all_day: e.target.checked })} />
                <span className="text-sm text-gray-700">All day</span>
              </div>
              {!blockForm.all_day && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Start time</label>
                    <input type="time" value={blockForm.start_time} onChange={(e) => setBlockForm({ ...blockForm, start_time: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">End time</label>
                    <input type="time" value={blockForm.end_time} onChange={(e) => setBlockForm({ ...blockForm, end_time: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
                  </div>
                </>
              )}
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea value={blockForm.notes} onChange={(e) => setBlockForm({ ...blockForm, notes: e.target.value })} rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowBlockForm(false)} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancel</button>
              <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                {editingBlockId ? 'Save Block' : 'Create Block'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
