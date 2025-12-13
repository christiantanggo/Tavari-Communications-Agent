import Cookies from 'js-cookie';
import { authAPI } from './api';

export const setToken = (token) => {
  Cookies.set('token', token, { expires: 7 });
};

export const getToken = () => {
  return Cookies.get('token');
};

export const removeToken = () => {
  Cookies.remove('token');
};

export const isAuthenticated = () => {
  return !!getToken();
};

export const login = async (email, password) => {
  const response = await authAPI.login({ email, password });
  const { token } = response.data;
  setToken(token);
  return response.data;
};

export const signup = async (data) => {
  const response = await authAPI.signup(data);
  const { token } = response.data;
  setToken(token);
  return response.data;
};

export const logout = async () => {
  try {
    await authAPI.logout();
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    removeToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
};

