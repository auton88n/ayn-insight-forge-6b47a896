/**
 * HeroJobSearch — the landing page's real search, not a preview of one.
 *
 * Reported directly: the landing page should work the way Indeed's own
 * homepage does, a real search a visitor can actually use right there,
 * not a picture of what the app can do. This is that -- two real
 * fields (keyword, location), submitting straight into the real,
 * already-built public search at /jobs (PublicJobs.tsx), which reads
 * both back out of the URL. No new search logic here, this just gives
 * that existing page a real front door.
 */
import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin } from 'lucide-react';

export const HeroJobSearch = memo(() => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [where, setWhere] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (where.trim()) params.set('where', where.trim());
    const qs = params.toString();
    navigate(qs ? `/jobs?${qs}` : '/jobs');
  };

  return (
    <form className="lp-hero-search" onSubmit={submit} role="search" aria-label="Search real jobs">
      <span className="lp-hero-search-field">
        <Search size={17} aria-hidden="true" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Job title or keyword"
          aria-label="Job title or keyword"
        />
      </span>
      <span className="lp-hero-search-field">
        <MapPin size={17} aria-hidden="true" />
        <input
          type="text"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="City or remote"
          aria-label="Location"
        />
      </span>
      <button type="submit" className="lp-hero-search-btn">
        Search jobs
      </button>
    </form>
  );
});

HeroJobSearch.displayName = 'HeroJobSearch';
