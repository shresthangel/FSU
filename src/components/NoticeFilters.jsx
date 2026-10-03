import React from 'react';
import { Search } from 'lucide-react';
import { Card } from './ui/card.jsx';
import { Input } from './ui/input.jsx';
import { Select } from './ui/select.jsx';

const categories = [
  ['all', 'All categories'],
  ['exam', 'Exam'],
  ['event', 'Event'],
  ['scholarship', 'Scholarship'],
  ['general', 'General'],
];

export default function NoticeFilters() {
  return (
    <Card className="card filter-bar">
      <div className="filter-search">
        <Search aria-hidden="true" />
        <Input id="noticeSearch" type="search" placeholder="Search notices..." />
      </div>
      <Select id="noticeCategory" aria-label="Filter notices by category">
        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
    </Card>
  );
}
