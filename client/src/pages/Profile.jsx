import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Users, MapPin, Building, Link as LinkIcon, BookOpen, Star, Edit3, Check, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import ContributionCalendar from '../components/profile/ContributionCalendar';
import RepoCard from '../components/profile/RepoCard';

export default function Profile() {
  const { username } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser, updateProfile } = useAuth();

  const [profileData, setProfileData] = useState(null);
  const [repos, setRepos] = useState([]);
  const [starred, setStarred] = useState([]);
  const [activityData, setActivityData] = useState({ calendar: {}, recent: [], totalContributions: 0 });
  const [loading, setLoading] = useState(true);
  const [repoSearch, setRepoSearch] = useState('');

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const activeTab = searchParams.get('tab') || 'overview'; // 'overview' | 'repositories' | 'stars'
  const isSelf = currentUser && currentUser.username === username.toLowerCase();

  const loadProfile = async () => {
    try {
      const [uData, rData, sData, aData] = await Promise.all([
        api.getUser(username),
        api.getUserRepos(username),
        api.getUserStarred(username),
        api.getUserActivity(username)
      ]);
      setProfileData(uData);
      setRepos(rData.repositories || []);
      setStarred(sData.repositories || []);
      setActivityData(aData);

      setEditBio(uData.user?.bio || '');
      setEditCompany(uData.user?.company || '');
      setEditLocation(uData.user?.location || '');
      setEditWebsite(uData.user?.website || '');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [username, currentUser]);

  const handleFollowToggle = async () => {
    if (!currentUser) {
      alert('Please sign in to follow users.');
      return;
    }
    try {
      const res = await api.toggleFollow(username);
      setProfileData(prev => ({
        ...prev,
        isFollowing: res.following,
        stats: {
          ...prev.stats,
          followers: prev.stats.followers + (res.following ? 1 : -1)
        }
      }));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({
        bio: editBio,
        company: editCompany,
        location: editLocation,
        website: editWebsite
      });
      setEditing(false);
      loadProfile();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return <div className="p-16 text-center text-gh-muted animate-pulse text-xs">Loading profile...</div>;
  }

  if (!profileData) {
    return <div className="p-16 text-center text-gh-muted text-xs">User not found.</div>;
  }

  const { user: profileUser, isFollowing, stats } = profileData;

  const filteredRepos = repos.filter(r =>
    r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Profile Sidebar */}
        <div className="space-y-4">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <img
              src={profileUser.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${profileUser.username}`}
              alt={profileUser.username}
              className="w-48 h-48 sm:w-64 sm:h-64 rounded-full border border-gh-border bg-gh-subtle object-cover shadow-xl mb-4"
            />
            <h1 className="text-2xl font-bold text-gh-text leading-tight">{profileUser.name || profileUser.username}</h1>
            <p className="text-base text-gh-muted font-light">@{profileUser.username}</p>
          </div>

          {/* Bio */}
          {editing ? (
            <form onSubmit={handleSaveProfile} className="space-y-3 pt-2 text-xs">
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Add a bio"
                rows={3}
                className="w-full bg-gh-bg border border-gh-border rounded p-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
              <input
                type="text"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                placeholder="Company"
                className="w-full bg-gh-bg border border-gh-border rounded p-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="Location"
                className="w-full bg-gh-bg border border-gh-border rounded p-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
              <input
                type="text"
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                placeholder="Website URL"
                className="w-full bg-gh-bg border border-gh-border rounded p-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-3 py-1 bg-gh-green hover:bg-gh-greenHover text-white rounded font-semibold text-xs"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border text-gh-text rounded text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {profileUser.bio && (
                <p className="text-xs text-gh-text leading-relaxed">{profileUser.bio}</p>
              )}

              {/* Action Button: Edit Profile or Follow */}
              {isSelf ? (
                <button
                  onClick={() => setEditing(true)}
                  className="w-full py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded-md text-xs font-semibold text-gh-text flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit profile
                </button>
              ) : (
                <button
                  onClick={handleFollowToggle}
                  className={`w-full py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                    isFollowing
                      ? 'bg-gh-subtle border-gh-border text-gh-text hover:border-gh-muted'
                      : 'bg-gh-surface hover:bg-gh-subtle border-gh-border text-gh-text hover:border-gh-muted'
                  }`}
                >
                  {isFollowing ? 'Unfollow' : 'Follow'}
                </button>
              )}
            </div>
          )}

          {/* Social Stats */}
          <div className="flex items-center gap-3 text-xs text-gh-muted pt-2">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <strong className="text-gh-text">{stats.followers}</strong> followers
            </span>
            &bull;
            <span>
              <strong className="text-gh-text">{stats.following}</strong> following
            </span>
          </div>

          {/* Meta Details */}
          <div className="space-y-2 text-xs text-gh-muted pt-2 border-t border-gh-border/50">
            {profileUser.company && (
              <div className="flex items-center gap-2">
                <Building className="w-3.5 h-3.5" />
                <span>{profileUser.company}</span>
              </div>
            )}
            {profileUser.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                <span>{profileUser.location}</span>
              </div>
            )}
            {profileUser.website && (
              <div className="flex items-center gap-2">
                <LinkIcon className="w-3.5 h-3.5" />
                <a href={profileUser.website} target="_blank" rel="noreferrer" className="text-gh-link hover:underline truncate">
                  {profileUser.website}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Right Main Content Tabs */}
        <div className="lg:col-span-3 space-y-6">
          {/* Profile Navigation Tabs */}
          <div className="flex border-b border-gh-border text-xs font-semibold">
            <button
              onClick={() => setSearchParams({ tab: 'overview' })}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                activeTab === 'overview'
                  ? 'border-[#f78166] text-gh-text font-bold'
                  : 'border-transparent text-gh-muted hover:text-gh-text'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Overview</span>
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'repositories' })}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                activeTab === 'repositories'
                  ? 'border-[#f78166] text-gh-text font-bold'
                  : 'border-transparent text-gh-muted hover:text-gh-text'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Repositories</span>
              <span className="px-1.5 py-0.2 rounded-full bg-gh-subtle text-[11px] text-gh-muted">
                {repos.length}
              </span>
            </button>
            <button
              onClick={() => setSearchParams({ tab: 'stars' })}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                activeTab === 'stars'
                  ? 'border-[#f78166] text-gh-text font-bold'
                  : 'border-transparent text-gh-muted hover:text-gh-text'
              }`}
            >
              <Star className="w-4 h-4" />
              <span>Stars</span>
              <span className="px-1.5 py-0.2 rounded-full bg-gh-subtle text-[11px] text-gh-muted">
                {starred.length}
              </span>
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Popular Repositories */}
              <div>
                <h3 className="text-xs font-semibold text-gh-text mb-3">Popular repositories</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {repos.slice(0, 4).map((r) => (
                    <RepoCard key={r._id} repo={r} />
                  ))}
                  {repos.length === 0 && (
                    <div className="col-span-2 p-8 border border-gh-border rounded-md text-center text-gh-muted text-xs">
                      No public repositories created yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Contribution Activity Heatmap */}
              <div>
                <ContributionCalendar
                  calendarData={activityData.calendar}
                  totalContributions={activityData.totalContributions}
                />
              </div>

              {/* Activity Timeline */}
              <div className="border border-gh-border rounded-md bg-gh-surface p-4 text-xs space-y-3">
                <h3 className="font-semibold text-gh-text">Contribution Activity</h3>
                <div className="space-y-2 divide-y divide-gh-border/50">
                  {(activityData.recent || []).slice(0, 10).map((act, idx) => (
                    <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-gh-muted">
                      <span className="text-gh-text">{act.details || `Contributed to ${act.repoName}`}</span>
                      <span className="text-[11px]">{act.date}</span>
                    </div>
                  ))}
                  {(!activityData.recent || activityData.recent.length === 0) && (
                    <p className="text-gh-muted italic pt-2">No recent contribution activity.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Repositories Tab */}
          {activeTab === 'repositories' && (
            <div className="space-y-4">
              <div className="relative max-w-md">
                <Search className="w-3.5 h-3.5 text-gh-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Find a repository..."
                  className="w-full bg-gh-bg border border-gh-border rounded-md pl-9 pr-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRepos.map((r) => (
                  <RepoCard key={r._id} repo={r} />
                ))}
                {filteredRepos.length === 0 && (
                  <div className="col-span-2 p-12 text-center text-gh-muted text-xs">
                    No repositories matched your search.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stars Tab */}
          {activeTab === 'stars' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {starred.map((r) => (
                <RepoCard key={r._id} repo={r} />
              ))}
              {starred.length === 0 && (
                <div className="col-span-2 p-12 text-center text-gh-muted text-xs">
                  This user has not starred any repositories yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
