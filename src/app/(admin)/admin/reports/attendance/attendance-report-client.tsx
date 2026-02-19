'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface Section {
  id: string;
  name: string;
}

interface AttendanceReportClientProps {
  sections: Section[];
  startDate: string;
  endDate: string;
  sectionId: string;
  eventType: string;
}

const eventTypes = [
  { value: 'REHEARSAL', label: 'Rehearsal' },
  { value: 'CONCERT', label: 'Concert' },
  { value: 'SECTIONAL', label: 'Sectional' },
  { value: 'BOARD_MEETING', label: 'Board Meeting' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'OTHER', label: 'Other' },
];

export function AttendanceReportClient({
  sections,
  startDate: initialStartDate,
  endDate: initialEndDate,
  sectionId: initialSectionId,
  eventType: initialEventType,
}: AttendanceReportClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [eventType, setEventType] = useState(initialEventType);

  const handleApplyFilters = () => {
    const params = new URLSearchParams();
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (sectionId) params.set('sectionId', sectionId);
    if (eventType) params.set('eventType', eventType);

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSectionId('');
    setEventType('');
    router.push(pathname);
  };

  const handleQuickDateRange = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="section">Section</Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger id="section">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="eventType">Event Type</Label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger id="eventType">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {eventTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleApplyFilters}>
          <Search className="mr-2 h-4 w-4" />
          Apply Filters
        </Button>
        <Button variant="outline" onClick={handleClearFilters}>
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
        <div className="flex gap-1 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuickDateRange(7)}
          >
            7 Days
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuickDateRange(30)}
          >
            30 Days
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuickDateRange(90)}
          >
            90 Days
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuickDateRange(365)}
          >
            1 Year
          </Button>
        </div>
      </div>
    </div>
  );
}
