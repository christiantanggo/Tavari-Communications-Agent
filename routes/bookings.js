import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { Booking, BookingBlock, BookingSettings } from '../models/Booking.js';
import {
  cancelBooking,
  confirmBooking,
  createBooking,
  createBookingBlock,
  getAvailableSlotsForDate,
  getBookingContext,
  rescheduleBooking,
  updateBookingBlock,
  updateBookingDetails,
} from '../services/bookings.js';

const router = express.Router();

router.get('/settings', authenticate, async (req, res) => {
  try {
    const settings = await BookingSettings.findByBusinessId(req.businessId);
    res.json({ settings });
  } catch (error) {
    console.error('[Bookings API] Failed to load booking settings:', error);
    res.status(500).json({ error: 'Failed to load booking settings' });
  }
});

router.put('/settings', authenticate, async (req, res) => {
  try {
    const settings = await BookingSettings.upsertByBusinessId(req.businessId, req.body || {});
    res.json({ success: true, settings });
  } catch (error) {
    console.error('[Bookings API] Failed to save booking settings:', error);
    res.status(500).json({ error: error.message || 'Failed to save booking settings' });
  }
});

router.get('/slots', authenticate, async (req, res) => {
  try {
    const { date, duration_minutes } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }
    const slots = await getAvailableSlotsForDate(req.businessId, String(date), duration_minutes);
    res.json({ slots });
  } catch (error) {
    console.error('[Bookings API] Failed to load slots:', error);
    res.status(500).json({ error: error.message || 'Failed to load slots' });
  }
});

router.get('/calendar', authenticate, async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum) {
      return res.status(400).json({ error: 'month is required (YYYY-MM)' });
    }

    const start = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));
    const [bookings, blocks] = await Promise.all([
      Booking.findByBusinessId(req.businessId, {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 500,
      }),
      BookingBlock.findByBusinessId(req.businessId, {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }),
    ]);

    res.json({ bookings, blocks });
  } catch (error) {
    console.error('[Bookings API] Failed to load calendar data:', error);
    res.status(500).json({ error: 'Failed to load calendar data' });
  }
});

router.get('/blocks', authenticate, async (req, res) => {
  try {
    const blocks = await BookingBlock.findByBusinessId(req.businessId, {
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
    });
    res.json({ blocks });
  } catch (error) {
    console.error('[Bookings API] Failed to load blocks:', error);
    res.status(500).json({ error: 'Failed to load booking blocks' });
  }
});

router.post('/blocks', authenticate, async (req, res) => {
  try {
    const block = await createBookingBlock(
      {
        ...req.body,
        business_id: req.businessId,
      },
      req.user?.id || null,
    );
    res.status(201).json({ block });
  } catch (error) {
    console.error('[Bookings API] Failed to create block:', error);
    res.status(500).json({ error: error.message || 'Failed to create booking block' });
  }
});

router.put('/blocks/:blockId', authenticate, async (req, res) => {
  try {
    const existing = await BookingBlock.findById(req.params.blockId);
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Booking block not found' });
    }
    const block = await updateBookingBlock(req.params.blockId, req.body || {}, req.user?.id || null);
    res.json({ block });
  } catch (error) {
    console.error('[Bookings API] Failed to update block:', error);
    res.status(500).json({ error: error.message || 'Failed to update booking block' });
  }
});

router.delete('/blocks/:blockId', authenticate, async (req, res) => {
  try {
    const existing = await BookingBlock.findById(req.params.blockId);
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Booking block not found' });
    }
    const block = await BookingBlock.softDelete(req.params.blockId, req.user?.id || null);
    res.json({ success: true, block });
  } catch (error) {
    console.error('[Bookings API] Failed to delete block:', error);
    res.status(500).json({ error: 'Failed to delete booking block' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const bookings = await Booking.findByBusinessId(req.businessId, {
      status: req.query.status || null,
      search: req.query.search || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: parseInt(req.query.limit, 10) || 500,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    const context = await getBookingContext(req.businessId);
    res.json({
      bookings,
      settings: context.settings,
      timezone: context.business.timezone || 'America/New_York',
    });
  } catch (error) {
    console.error('[Bookings API] Failed to load bookings:', error);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const result = await createBooking(
      {
        ...req.body,
        business_id: req.businessId,
        source: req.body?.source || 'dashboard',
      },
      req.user?.id || null,
    );
    res.status(201).json(result);
  } catch (error) {
    console.error('[Bookings API] Failed to create booking:', error);
    res.status(500).json({ error: error.message || 'Failed to create booking' });
  }
});

router.get('/:bookingId', authenticate, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking || booking.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ booking });
  } catch (error) {
    console.error('[Bookings API] Failed to load booking:', error);
    res.status(500).json({ error: 'Failed to load booking' });
  }
});

router.put('/:bookingId', authenticate, async (req, res) => {
  try {
    const existing = await Booking.findById(req.params.bookingId);
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = await updateBookingDetails(req.params.bookingId, req.body || {}, req.user?.id || null);
    res.json({ booking });
  } catch (error) {
    console.error('[Bookings API] Failed to update booking:', error);
    res.status(500).json({ error: error.message || 'Failed to update booking' });
  }
});

router.post('/:bookingId/confirm', authenticate, async (req, res) => {
  try {
    const existing = await Booking.findById(req.params.bookingId);
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = await confirmBooking(req.params.bookingId, req.user?.id || null);
    res.json({ booking });
  } catch (error) {
    console.error('[Bookings API] Failed to confirm booking:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm booking' });
  }
});

router.post('/:bookingId/cancel', authenticate, async (req, res) => {
  try {
    const existing = await Booking.findById(req.params.bookingId);
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = await cancelBooking(req.params.bookingId, req.body?.cancel_reason, req.user?.id || null);
    res.json({ booking });
  } catch (error) {
    console.error('[Bookings API] Failed to cancel booking:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel booking' });
  }
});

router.post('/:bookingId/reschedule', authenticate, async (req, res) => {
  try {
    const existing = await Booking.findById(req.params.bookingId);
    if (!existing || existing.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = await rescheduleBooking(req.params.bookingId, req.body || {}, req.user?.id || null);
    res.json({ booking });
  } catch (error) {
    console.error('[Bookings API] Failed to reschedule booking:', error);
    res.status(500).json({ error: error.message || 'Failed to reschedule booking' });
  }
});

export default router;
