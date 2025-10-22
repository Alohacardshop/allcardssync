export interface GcdSeries {
  id: number;
  name: string;
  year_began?: number;
  publisher?: string;
  url: string;
  issue_count?: number;
}

export interface GcdPublisher {
  id: number;
  name: string;
  country?: string;
  url: string;
}

export interface GcdIssue {
  id: number;
  number: string;
  cover_date?: string;
  title?: string;
  url: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  hasNext: boolean;
  source: "GCD";
  license: "CC BY-SA 4.0";
}

export interface MarvelComic {
  id: number;
  title: string;
  issueNumber: number;
  description: string;
  thumbnail: {
    path: string;
    extension: string;
  };
  dates: Array<{
    type: string;
    date: string;
  }>;
  creators: {
    available: number;
    items: Array<{
      name: string;
      role: string;
    }>;
  };
  format: string;
  pageCount: number;
  series: {
    name: string;
  };
}

export interface MarvelSearchResult {
  comics: MarvelComic[];
  total: number;
  count: number;
  attribution: string;
  cached?: boolean;
}
