'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

interface GigChecklistProps {
  items: string[];
}

export function GigChecklist({ items }: GigChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (item: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [item]: !prev[item]
    }));
  };

  if (!items || items.length === 0) {
    return <p className="text-muted-foreground">No checklist provided for this event.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gig Checklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center space-x-2">
            <Checkbox
              id={`item-${idx}`}
              checked={checkedItems[item] || false}
              onCheckedChange={() => toggleItem(item)}
            />
            <Label
              htmlFor={`item-${idx}`}
              className={checkedItems[item] ? 'line-through text-muted-foreground' : ''}
            >
              {item}
            </Label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
