import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** How many things are shown after filtering, and how many there are in total. */
  shown?: number;
  total?: number;
  /** Word for the things being counted, e.g. "tools" (default "results"). */
  noun?: string;
  className?: string;
  id?: string;
}

/**
 * The one search box used everywhere: filters as you type, has a clear (X) button, and
 * says "Showing X of Y". Pair it with matchesSearch() from src/lib/search.ts.
 */
export const SearchBox: React.FC<SearchBoxProps> = ({
  value, onChange, placeholder = 'Search…', shown, total, noun = 'results', className = '', id,
}) => {
  const hasCounts = shown !== undefined && total !== undefined;
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onChange(''); }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-12 pl-10 pr-12 text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      {hasCounts && (
        <p className="text-sm text-gray-700" aria-live="polite">
          {value ? `Showing ${shown} of ${total} ${noun}` : `${total} ${noun}`}
        </p>
      )}
    </div>
  );
};
