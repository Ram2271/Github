import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import NewRepo from './pages/NewRepo';
import Search from './pages/Search';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import RepoView from './pages/RepoView';

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <div className="flex flex-col min-h-screen bg-gh-bg text-gh-text selection:bg-gh-link/30 selection:text-white">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/new" element={<NewRepo />} />
                <Route path="/search" element={<Search />} />
                <Route path="/notifications" element={<Notifications />} />
                
                {/* Specific Repo Routes */}
                <Route path="/:owner/:repo" element={<RepoView />} />
                <Route path="/:owner/:repo/*" element={<RepoView />} />

                {/* User Profile Route (1 segment, e.g. /octocat) */}
                <Route path="/:username" element={<Profile />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
