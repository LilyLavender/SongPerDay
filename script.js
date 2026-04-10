const STORAGE_KEY = "dailySongs";

const app = Vue.createApp({
  data() {
    return {
      form: this.createEmptyForm(),
      entries: [],
      showArtistSuggestions: false,
      showAlbumSuggestions: false,
      activeTab: "log",
      canonFormInput: "",
      showFeatSuggestions: false,
      showCanonSuggestions: false,
      editingDate: null,
    };
  },

  mounted() {
    this.entries = this.loadEntries();
  },

  watch: {
    // When date changes, prefill if entry exists
    "form.date"(newDate) {
      const existing = this.entries.find(e => e.date === newDate);
      if (existing) {
        this.form = { ...existing };
      } else {
        tempDate = this.form.date;
        this.form = {};
        this.form.date = tempDate;
      }
    },

    // When album changes, try to prefill year + art
    "form.album"(newAlbum) {
      if (!newAlbum) return;

      const match = this.entries.find(
        e =>
          this.normalize(e.album) === this.normalize(newAlbum) &&
          e.artist === this.form.artist
      );

      if (match) {
        this.form.year ||= match.year;
        this.form.albumArt ||= match.albumArt;
      }
    }
  },

  computed: {
    yearEntries() {
      const year = new Date().getFullYear();
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);

      const map = new Map(
        this.entries.map(e => [e.date, e])
      );

      const days = [];
      for (
        let d = new Date(start);
        d <= end;
        d.setDate(d.getDate() + 1)
      ) {
        const iso = d.toISOString().slice(0, 10);
        days.push({
          date: iso,
          entry: map.get(iso) || null
        });
      }

      return days;
    },

    todayISOComputed() {
      return this.todayISO();
    },

    allArtists() {
      const names = new Set();
      this.entries.forEach(e => {
        if (e.artist) names.add(e.artist);
        if (e.featuring) names.add(e.featuring);
        (e.canonArtists || []).forEach(a => names.add(a));
      });
      return [...names];
    },

    filteredArtists() {
      const input = this.normalize(this.form.artist);
      if (!input) return [];
      return this.allArtists.filter(a => this.normalize(a).includes(input));
    },

    filteredFeat() {
      const input = this.normalize(this.form.featuring);
      if (!input) return [];
      return this.allArtists.filter(a => this.normalize(a).includes(input));
    },

    filteredCanon() {
      const input = this.normalize(this.canonFormInput);
      if (!input) return [];
      return this.allArtists.filter(a => this.normalize(a).includes(input));
    },

    filteredAlbums() {
      const input = this.normalize(this.form.album);
      if (!input || !this.form.artist) return [];
    
      return [...new Set(
        this.entries
          .filter(e => e.artist === this.form.artist)
          .map(e => e.album)
      )].filter(a => this.normalize(a).includes(input));
    },

    artistStats() {
      const names = [];
      this.entries.forEach(e => {
        if (e.canonArtists && e.canonArtists.length) {
          names.push(...e.canonArtists);
        } else {
          names.push(e.artist);
        }
      });
      return this.buildStats(names);
    },

    albumStats() {
      return this.buildStats(this.entries.map(e => e.album));
    },

    yearStats() {
      return this.buildStats(this.entries.map(e => e.year));
    },

    yearBarStats() {
      const counts = {};
      this.entries.forEach(e => {
        if (e.year) counts[e.year] = (counts[e.year] || 0) + 1;
      });

      const years = Object.keys(counts).map(Number).sort((a, b) => a - b);
      if (!years.length) return [];

      const result = [];
      for (let y = years[0]; y <= years[years.length - 1]; y++) {
        result.push({ name: String(y), count: counts[y] || 0 });
      }
      return result;
    },

    maxYearCount() {
      return Math.max(...this.yearBarStats.map(y => y.count), 1);
    },
  },

  methods: {
    // ---- Helpers ----
    todayISO() {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      return new Date(now - offset).toISOString().slice(0, 10);
    },

    formatMonth(dateStr) {
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString(undefined, {
        month: "short"
      });
    },

    formatDay(dateStr) {
      const date = new Date(dateStr + "T00:00:00");
      return date.getDate();
    },

    normalize(str) {
      return str?.trim().toLowerCase();
    },

    createEmptyForm() {
      return {
        date: this.todayISO(),
        song: "",
        artist: "",
        featuring: "",
        album: "",
        year: "",
        albumArt: "",
        canonArtists: [],
      };
    },

    // ---- Storage ----
    loadEntries() {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    },

    saveEntries() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    },

    // ---- Canon artists (per-song) ----
    addCanonArtist() {
      const name = this.canonFormInput.trim();
      if (!name || (this.form.canonArtists || []).includes(name)) return;
      if (!this.form.canonArtists) this.form.canonArtists = [];
      this.form.canonArtists.push(name);
      this.canonFormInput = "";
    },

    removeCanonArtist(i) {
      this.form.canonArtists.splice(i, 1);
    },

    // ---- Validation ----
    dateExists(date) {
      return this.entries.some(e => e.date === date);
    },

    songExists(song, artist, date) {
      const s = this.normalize(song);
      const a = this.normalize(artist);

      return this.entries.some(
        e =>
          e.date !== date &&
          this.normalize(e.song) === s &&
          this.normalize(e.artist) === a
      );
    },

    // ---- Actions ----
    saveSong() {
      if (!this.form.date) {
        this.form.date = this.todayISO();
      }

      if (this.songExists(this.form.song, this.form.artist, this.form.date)) {
        alert("This song has already been logged.");
        return;
      }

      const index = this.entries.findIndex(e => e.date === this.form.date);

      if (index !== -1) {
        // Update existing day
        this.entries.splice(index, 1, { ...this.form });
      } else {
        // New day
        this.entries.push({ ...this.form });
      }

      this.saveEntries();
      this.form = this.createEmptyForm();
      this.canonFormInput = "";
      this.editingDate = null;
    },

    selectEntry(date) {
      this.editingDate = date;
      this.form.date = date;
    },

    onArtistInput() {
      this.showArtistSuggestions = true;
      this.form.album = "";
      this.form.year = "";
      this.form.albumArt = "";
    },

    onAlbumInput() {
      this.showAlbumSuggestions = true;
    },

    selectArtist(artist) {
      this.form.artist = artist;
      this.showArtistSuggestions = false;
    },

    selectFeat(feat) {
      this.form.featuring = feat;
      this.showFeatSuggestions = false;
    },

    selectCanon(name) {
      this.canonFormInput = name;
      this.addCanonArtist();
      this.showCanonSuggestions = false;
    },

    selectAlbum(album) {
      this.form.album = album;
    
      const match = this.entries.find(
        e => e.artist === this.form.artist && e.album === album
      );
    
      if (match) {
        this.form.year = match.year;
        this.form.albumArt = match.albumArt;
      }
    
      this.showAlbumSuggestions = false;
    },

    hideSuggestions(type) {
      // Delay so click can register
      setTimeout(() => {
        if (type === "artist") this.showArtistSuggestions = false;
        if (type === "album") this.showAlbumSuggestions = false;
        if (type === "feat") this.showFeatSuggestions = false;
        if (type === "canon") this.showCanonSuggestions = false;
      }, 100);
    },

    buildStats(list) {
      const map = {};
        
      list.forEach(item => {
        if (!item) return;
        map[item] = (map[item] || 0) + 1;
      });
    
      return Object.entries(map)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    },
  }
});

app.mount("#app");
