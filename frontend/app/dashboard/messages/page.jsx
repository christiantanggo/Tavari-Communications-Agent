'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { messagesAPI } from '@/lib/api';
import Link from 'next/link';

function MessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const res = await messagesAPI.list({ limit: 100 });
      setMessages(res.data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (messageId) => {
    try {
      await messagesAPI.markRead(messageId);
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, read: true } : msg))
      );
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Messages</h1>
            <div className="space-x-4">
              <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow">
            {messages.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-600">No messages yet. Messages left by callers will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-6 ${!message.read ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {message.caller_name || 'Unknown Caller'}
                          </h3>
                          {!message.read && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-600 text-white">
                              New
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-gray-600 mb-3">
                          {message.caller_phone && (
                            <p>
                              <span className="font-medium">Phone:</span> {message.caller_phone}
                            </p>
                          )}
                          {message.caller_email && (
                            <p>
                              <span className="font-medium">Email:</span> {message.caller_email}
                            </p>
                          )}
                          <p>
                            <span className="font-medium">Date:</span> {formatDate(message.created_at)}
                          </p>
                        </div>
                        {message.reason && (
                          <div className="mb-3">
                            <p className="text-sm font-medium text-gray-700 mb-1">Reason for calling:</p>
                            <p className="text-gray-900">{message.reason}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-1">Message:</p>
                          <p className="text-gray-900 whitespace-pre-wrap">{message.message_text}</p>
                        </div>
                      </div>
                      {!message.read && (
                        <button
                          onClick={() => markAsRead(message.id)}
                          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                        >
                          Mark as Read
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default MessagesPage;

