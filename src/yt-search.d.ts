declare module "yt-search" {
  interface Author {
    name: string;
    url: string;
  }

  interface VideoSearchResult {
    type: "video";
    videoId: string;
    url: string;
    title: string;
    description: string;
    image: string;
    thumbnail: string;
    seconds: number;
    timestamp: string;
    duration: {
      toString(): string;
      seconds: number;
      timestamp: string;
    };
    views: number;
    genre: string;
    uploadDate: string;
    ago: string;
    author: Author;
  }

  interface SearchResult {
    videos: VideoSearchResult[];
    playlists: any[];
    lists: any[];
    accounts: any[];
    channels: any[];
  }

  function search(query: string | { query: string }): Promise<SearchResult>;

  export default search;
}
