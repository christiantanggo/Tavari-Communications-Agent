// models/PricingPackage.js
// Pricing package model

import { supabaseClient } from '../config/database.js';

export class PricingPackage {
  static async create(data) {
    const {
      name,
      description,
      monthly_price,
      minutes_included = 0,
      overage_price_per_minute = 0,
      sms_included = 0,
      sms_overage_price = 0,
      emails_included = 0,
      emails_overage_price = 0,
      max_faqs = 5,
      stripe_product_id,
      stripe_price_id,
      is_active = true,
      is_public = true,
    } = data;

    if (!name || !monthly_price) {
      throw new Error('Name and monthly price are required');
    }

    const { data: pkg, error } = await supabaseClient
      .from('pricing_packages')
      .insert({
        name,
        description,
        monthly_price,
        minutes_included,
        overage_price_per_minute,
        sms_included,
        sms_overage_price,
        emails_included,
        emails_overage_price,
        max_faqs,
        stripe_product_id,
        stripe_price_id,
        is_active,
        is_public,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return pkg;
  }

  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('pricing_packages')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findAll(options = {}) {
    const { includeInactive = false, includePrivate = false } = options;
    
    let query = supabaseClient
      .from('pricing_packages')
      .select('*')
      .is('deleted_at', null);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    if (!includePrivate) {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query.order('monthly_price', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const { data: pkg, error } = await supabaseClient
      .from('pricing_packages')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return pkg;
  }

  static async delete(id) {
    const { data, error } = await supabaseClient
      .from('pricing_packages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getBusinessCount(packageId) {
    const { count, error } = await supabaseClient
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .eq('package_id', packageId)
      .is('deleted_at', null);

    if (error) throw error;
    return count || 0;
  }

  static async getBusinesses(packageId) {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('id, name, email, created_at, ai_enabled')
      .eq('package_id', packageId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

