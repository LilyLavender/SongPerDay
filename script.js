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
      albumCoverOverrides: {},
      albumCoverOverlay: null,
      albumCoverCustomInput: "",
      selectedYear: new Date().getFullYear(),
      collapsedMonths: {},
      pendingDate: null,
      showConfirmDialog: false,
      selectedStatYear: null,
      selectedArtist: null,
    };
  },

  mounted() {
    this.entries = this.loadEntries();
    this.albumCoverOverrides = this.loadAlbumCovers();

    // Collapse all months except the current one
    const currentMonth = this.todayISO().slice(0, 7);
    this.$nextTick(() => {
      const collapsed = {};
      this.monthGroups.forEach(m => {
        if (m.key !== currentMonth) collapsed[m.key] = true;
      });
      this.collapsedMonths = collapsed;
      this.$nextTick(() => this.scrollToToday());
    });
  },

  watch: {
    // When date changes, prefill if entry exists
    "form.date"(newDate) {
      const existing = this.entries.find(e => e.date === newDate);
      if (existing) {
        this.form = { ...existing, canonArtists: existing.canonArtists || [] };
      } else {
        const d = newDate;
        this.form = this.createEmptyForm();
        this.form.date = d;
      }
      this.canonFormInput = "";
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
    },
  },

  computed: {
    yearEntries() {
      const year = this.selectedYear;
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      const map = new Map(this.entries.map(e => [e.date, e]));
      const days = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        days.push({ date: iso, entry: map.get(iso) || null });
      }
      return days;
    },

    monthGroups() {
      const groups = [];
      let current = null;
      this.yearEntries.forEach(day => {
        const key = day.date.slice(0, 7);
        if (!current || current.key !== key) {
          const d = new Date(day.date + "T00:00:00");
          current = {
            key,
            label: d.toLocaleDateString(undefined, { month: "long" }),
            days: [],
            filledCount: 0,
          };
          groups.push(current);
        }
        current.days.push(day);
        if (day.entry) current.filledCount++;
      });
      return groups;
    },

    todayISOComputed() {
      return this.todayISO();
    },

    hasUnsavedChanges() {
      const norm = obj => ({
        ...obj,
        canonArtists: obj.canonArtists && obj.canonArtists.length ? obj.canonArtists : [],
      });
      const saved = this.entries.find(e => e.date === this.form.date);
      if (!saved) {
        return !!(
          this.form.song || this.form.artist || this.form.featuring ||
          this.form.album || this.form.year || this.form.albumArt ||
          (this.form.canonArtists && this.form.canonArtists.length)
        );
      }
      return JSON.stringify(norm(saved)) !== JSON.stringify(norm(this.form));
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
      const stats = this.buildStats(names);

      if (this.selectedArtist) {
        return stats.map(a => ({ ...a, dimmed: a.name !== this.selectedArtist }));
      }

      if (this.selectedStatYear) {
        const active = new Set();
        this.entries
          .filter(e => String(e.year) === String(this.selectedStatYear))
          .forEach(e => {
            if (e.canonArtists && e.canonArtists.length) {
              e.canonArtists.forEach(a => active.add(a));
            } else {
              active.add(e.artist);
            }
          });
        return stats.map(a => ({ ...a, dimmed: !active.has(a.name) }));
      }

      return stats;
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
        if (e.year) counts[String(e.year)] = (counts[String(e.year)] || 0) + 1;
      });
      const years = Object.keys(counts).map(Number).sort((a, b) => a - b);
      if (!years.length) return [];
      const result = [];
      for (let y = years[0]; y <= years[years.length - 1]; y++) {
        result.push({ name: String(y), count: counts[String(y)] || 0 });
      }

      if (this.selectedArtist) {
        const artistYears = new Set();
        this.entries.forEach(e => {
          const match = (e.canonArtists && e.canonArtists.length)
            ? e.canonArtists.includes(this.selectedArtist)
            : e.artist === this.selectedArtist;
          if (match && e.year) artistYears.add(String(e.year));
        });
        return result.map(y => ({ ...y, selected: false, dimmed: !artistYears.has(y.name) }));
      }

      if (this.selectedStatYear) {
        return result.map(y => ({
          ...y,
          selected: y.name === String(this.selectedStatYear),
          dimmed: y.name !== String(this.selectedStatYear),
        }));
      }

      return result.map(y => ({ ...y, selected: false, dimmed: false }));
    },

    maxYearCount() {
      return Math.max(...this.yearBarStats.map(y => y.count), 1);
    },

    albumGridStats() {
      const map = {};
      this.entries.forEach(e => {
        if (!e.album) return;
        if (!map[e.album]) {
          map[e.album] = {
            name: e.album,
            count: 0,
            coverFreq: {},
            primaryArtist: e.artist,
            artistSet: new Set(),
          };
        }
        const a = map[e.album];
        a.count++;
        if (e.albumArt) a.coverFreq[e.albumArt] = (a.coverFreq[e.albumArt] || 0) + 1;
        const artists = (e.canonArtists && e.canonArtists.length) ? e.canonArtists : [e.artist];
        artists.forEach(name => a.artistSet.add(name));
      });

      const activeAlbums = this.selectedStatYear
        ? new Set(this.entries.filter(e => String(e.year) === String(this.selectedStatYear)).map(e => e.album))
        : null;

      return Object.values(map)
        .map(a => {
          const allCovers = Object.entries(a.coverFreq)
            .sort((x, y) => y[1] - x[1])
            .map(([url]) => url);
          const albumArt = this.albumCoverOverrides[a.name] || allCovers[0] || null;
          let dimmed = false;
          if (this.selectedArtist) {
            dimmed = !a.artistSet.has(this.selectedArtist);
          } else if (activeAlbums) {
            dimmed = !activeAlbums.has(a.name);
          }
          return {
            name: a.name, count: a.count, albumArt, allCovers,
            primaryArtist: a.primaryArtist,
            extraArtists: Math.max(0, a.artistSet.size - 1),
            dimmed,
          };
        })
        .sort((a, b) => b.count - a.count);
    },

    coverModalCovers() {
      if (!this.albumCoverOverlay) return [];
      const album = this.albumGridStats.find(a => a.name === this.albumCoverOverlay);
      return album ? album.allCovers : [];
    },

    activeCoverForModal() {
      return this.albumCoverOverrides[this.albumCoverOverlay] || this.coverModalCovers[0] || null;
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
      return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "short" });
    },

    formatDay(dateStr) {
      return new Date(dateStr + "T00:00:00").getDate();
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

    loadAlbumCovers() {
      const raw = localStorage.getItem("albumCoverOverrides");
      return raw ? JSON.parse(raw) : {};
    },

    saveAlbumCovers() {
      localStorage.setItem("albumCoverOverrides", JSON.stringify(this.albumCoverOverrides));
    },

    // ---- Date change with unsaved-changes guard ----
    requestDateChange(newDate, setEditing) {
      if (newDate === this.form.date) return;
      if (this.hasUnsavedChanges) {
        this.pendingDate = { date: newDate, setEditing };
        this.showConfirmDialog = true;
      } else {
        this.applyDateChange(newDate, setEditing);
      }
    },

    applyDateChange(date, setEditing) {
      this.form.date = date;
      if (setEditing) this.editingDate = date;
    },

    confirmDiscard() {
      const { date, setEditing } = this.pendingDate;
      this.pendingDate = null;
      this.showConfirmDialog = false;
      this.applyDateChange(date, setEditing);
    },

    cancelDateChange() {
      this.pendingDate = null;
      this.showConfirmDialog = false;
    },

    // ---- Month collapse ----
    toggleMonth(key) {
      this.collapsedMonths[key] = !this.collapsedMonths[key];
    },

    // ---- Scroll to today ----
    scrollToToday() {
      const today = this.todayISOComputed;
      const year = parseInt(today.slice(0, 4));
      const monthKey = today.slice(0, 7);

      this.selectedYear = year;
      this.collapsedMonths[monthKey] = false;

      this.$nextTick(() => {
        const el = document.querySelector(`[data-date="${today}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
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

    // ---- Clear helpers ----
    clearArtist() {
      this.form.artist = "";
      this.form.album = "";
      this.form.year = "";
      this.form.albumArt = "";
    },

    clearAlbum() {
      this.form.album = "";
      this.form.year = "";
      this.form.albumArt = "";
    },

    // ---- Validation ----
    songExists(song, artist, date) {
      const s = this.normalize(song);
      const a = this.normalize(artist);
      return this.entries.some(
        e => e.date !== date && this.normalize(e.song) === s && this.normalize(e.artist) === a
      );
    },

    // ---- Actions ----
    saveSong() {
      if (!this.form.date) this.form.date = this.todayISO();

      if (this.songExists(this.form.song, this.form.artist, this.form.date)) {
        alert("This song has already been logged.");
        return;
      }

      const index = this.entries.findIndex(e => e.date === this.form.date);
      if (index !== -1) {
        this.entries.splice(index, 1, { ...this.form });
      } else {
        this.entries.push({ ...this.form });
      }

      this.saveEntries();
      this.form = this.createEmptyForm();
      this.canonFormInput = "";
      this.editingDate = null;
    },

    // ---- Entry selection ----
    selectEntry(date) {
      this.requestDateChange(date, true);
    },

    // ---- Form input handlers ----
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
      const match = this.entries.find(e => e.artist === this.form.artist && e.album === album);
      if (match) {
        this.form.year = match.year;
        this.form.albumArt = match.albumArt;
      }
      this.showAlbumSuggestions = false;
    },

    hideSuggestions(type) {
      setTimeout(() => {
        if (type === "artist") this.showArtistSuggestions = false;
        if (type === "album") this.showAlbumSuggestions = false;
        if (type === "feat") this.showFeatSuggestions = false;
        if (type === "canon") this.showCanonSuggestions = false;
      }, 100);
    },

    // ---- Stat filters ----
    toggleStatYear(year) {
      this.selectedArtist = null;
      this.selectedStatYear = this.selectedStatYear === year ? null : year;
    },

    toggleStatArtist(name) {
      this.selectedStatYear = null;
      this.selectedArtist = this.selectedArtist === name ? null : name;
    },

    // ---- Cover picker ----
    openCoverPicker(name) {
      this.albumCoverOverlay = name;
      this.albumCoverCustomInput = "";
    },

    setAlbumCover(name, url) {
      this.albumCoverOverrides[name] = url;
      this.saveAlbumCovers();
      this.albumCoverOverlay = null;
      this.albumCoverCustomInput = "";
    },

    setCustomCover() {
      const url = this.albumCoverCustomInput.trim();
      if (!url) return;
      this.setAlbumCover(this.albumCoverOverlay, url);
    },

    // ---- Stats ----
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
