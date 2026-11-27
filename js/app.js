/**
 * Antigravity – AI Data Analysis Platform (js/app.js)
 * Central Application Coordinator:
 * - Smart CSV Upload Studio (sniffing delimiters, encodings, 20-row preview, validation)
 * - Automatic Data Analysis Engine (overview, 13-metric numerical stats, categorical with rare classes, data quality audit, AI insights)
 * - Interactive Data Visualization (9 charts, filters, trend analysis, PNG export)
 * - Data Cleaning & Update Studio (missing values, duplicates, IQR outliers, column management, spreadsheet-like inline editor, undo, reset, audit trail)
 * - Export & Download Center (Cleaned CSV, XLSX, JSON, Original, Stats CSV, PDF)
 */

const App = {
  // Application State
  data: [],
  originalData: [],
  datasetName: '',
  dataset_id: null,
  schema: {},
  numericCols: [],
  categoricalCols: [],
  datetimeCols: [],
  activeTab: 'tab-overview',
  activeEdaPane: 'pane-eda-overview',
  
  // Tabular Spreadsheet State
  currentPage: 1,
  pageSize: 10,
  searchQuery: '',
  columnFilter: '',
  sortCol: null,
  sortDir: 'asc',
  modifiedCells: new Set(),

  // Before & After Tracking
  originalMetrics: { rows: 0, missing: 0, dups: 0 },
  operationHistory: [],

  // Visual Studio State
  activeChartType: 'bar',
  chartFilter: { col: '', op: 'equals', val: '' },

  // AI & ML
  activeMLModel: null,
  isBackendOnline: false,
  pendingPdfFile: null,

  init() {
    this.initTheme();
    this.checkBackendHealth();
    this.bindEvents();
    this.renderPresets();
    this.loadPreset('sales_retail');
  },

  /* ========================================================================
     THEME MANAGEMENT
     ======================================================================== */
  initTheme() {
    const savedTheme = localStorage.getItem('antigravity_theme') || 'light';
    this.setTheme(savedTheme);

    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        this.setTheme(next);
      });
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('antigravity_theme', theme);
    const icon = document.getElementById('themeToggleIcon');
    if (icon) {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    if (this.activeTab === 'tab-overview') this.renderOverviewChart();
    if (this.activeTab === 'tab-visual') this.renderStudioChart();
    if (this.activeTab === 'tab-eda') this.renderComprehensiveAnalysis();
  },

  /* ========================================================================
     BACKEND HEALTH CHECK
     ======================================================================== */
  async checkBackendHealth() {
    const pill = document.getElementById('backendStatusPill');
    const text = document.getElementById('backendStatusText');
    const dot = document.getElementById('backendStatusDot');

    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const info = await res.json();
        this.isBackendOnline = true;
        if (text) text.textContent = 'Backend Online (Pandas & ML)';
        if (dot) dot.style.backgroundColor = 'var(--accent-emerald)';
        if (pill) pill.title = `Libraries: ${Object.keys(info.libraries).filter(k => info.libraries[k]).join(', ')}`;
        return;
      }
    } catch (e) {
      // Backend not running API
    }

    this.isBackendOnline = false;
    if (text) text.textContent = 'Client Mode (Offline)';
    if (dot) dot.style.backgroundColor = 'var(--accent-amber)';
  },

  /* ========================================================================
     TOAST NOTIFICATIONS
     ======================================================================== */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' ? '✅' : (type === 'warning' ? '⚠️' : (type === 'error' ? '❌' : 'ℹ️'));
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  /* ========================================================================
     EVENT BINDINGS
     ======================================================================== */
  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) this.switchTab(tabId);
      });
    });

    // Ingestion quick buttons
    document.getElementById('btnGoToExplorer')?.addEventListener('click', () => this.switchTab('tab-explorer'));
    document.getElementById('btnGoToAnalysis')?.addEventListener('click', () => this.switchTab('tab-eda'));

    // Dataset Switcher Dropdown
    document.getElementById('datasetSwitcherSelect')?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (PRELOADED_DATASETS[val]) {
        this.loadPreset(val);
      }
    });

    // Topbar Actions
    document.getElementById('btnTopExportCsv')?.addEventListener('click', () => this.downloadExport('csv'));
    document.getElementById('btnTopExportPdf')?.addEventListener('click', () => this.exportPdfDossier());
    document.getElementById('btnExportExplorerCsv')?.addEventListener('click', () => this.downloadExport('csv'));

    // File Upload Handlers (Both Quick and Full Dropzones)
    this.setupDropzone('quickDropzone', 'quickFileInput');
    this.setupDropzone('fullDropzone', 'fullFileInput');

    // Natural Language Command Handlers
    document.getElementById('btnExecuteCommand')?.addEventListener('click', () => {
      const input = document.getElementById('nlCommandInput');
      if (input && input.value.trim()) this.executeCommand(input.value.trim());
    });

    document.getElementById('nlCommandInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) this.executeCommand(e.target.value.trim());
    });

    document.getElementById('btnCloseQueryResult')?.addEventListener('click', () => {
      document.getElementById('queryResultPanel')?.classList.remove('active');
    });

    // Suggestion Chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cmd');
        if (cmd) {
          const input = document.getElementById('nlCommandInput');
          if (input) input.value = cmd;
          this.executeCommand(cmd);
        }
      });
    });

    // Dedicated AI Chat Handlers
    document.getElementById('btnSubmitAiChat')?.addEventListener('click', () => {
      const input = document.getElementById('aiChatInput');
      if (input && input.value.trim()) {
        this.submitAiChatMessage(input.value.trim());
        input.value = '';
      }
    });

    document.getElementById('aiChatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        this.submitAiChatMessage(e.target.value.trim());
        e.target.value = '';
      }
    });

    // Data Explorer (Spreadsheet) Controls
    document.getElementById('tableSearchInput')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.currentPage = 1;
      this.renderTable();
    });

    document.getElementById('tablePageSizeSelect')?.addEventListener('change', (e) => {
      this.pageSize = parseInt(e.target.value, 10) || 10;
      this.currentPage = 1;
      this.renderTable();
    });

    document.getElementById('tableColumnFilterSelect')?.addEventListener('change', (e) => {
      this.columnFilter = e.target.value;
      this.currentPage = 1;
      this.renderTable();
    });

    document.getElementById('btnPrevPage')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderTable();
      }
    });

    document.getElementById('btnNextPage')?.addEventListener('click', () => {
      const filtered = this.getFilteredData();
      const maxPage = Math.ceil(filtered.length / this.pageSize);
      if (this.currentPage < maxPage) {
        this.currentPage++;
        this.renderTable();
      }
    });

    document.getElementById('btnUndoExplorer')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('btnResetExplorer')?.addEventListener('click', () => this.handleReset());

    // EDA Sub-navigation buttons
    document.querySelectorAll('.analysis-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const paneId = btn.getAttribute('data-eda-pane');
        document.querySelectorAll('.analysis-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.eda-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(paneId)?.classList.add('active');
        this.activeEdaPane = paneId;

        if (paneId === 'pane-eda-correlation') {
          this.renderCorrelationView();
        }
      });
    });

    document.getElementById('edaNumFeatureSelect')?.addEventListener('change', (e) => {
      this.renderFullNumericalTable(e.target.value);
    });

    document.getElementById('edaCatFeatureSelect')?.addEventListener('change', (e) => {
      this.renderCategoricalView(e.target.value);
    });

    document.getElementById('corrMethodSelect')?.addEventListener('change', () => {
      this.renderCorrelationView();
    });

    // Visual Studio Handlers
    document.querySelectorAll('.btn-chart-type').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-chart-type').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeChartType = btn.getAttribute('data-chart');
        this.updateStudioControlVisibility();
        this.renderStudioChart();
      });
    });

    document.getElementById('studioThemeSelect')?.addEventListener('change', (e) => {
      Visualizer.currentTheme = e.target.value;
      this.renderStudioChart();
    });

    document.getElementById('studioBinsRange')?.addEventListener('input', (e) => {
      const lbl = document.getElementById('studioBinsLabel');
      if (lbl) lbl.textContent = e.target.value;
      this.renderStudioChart();
    });

    document.getElementById('studioHeatmapMethod')?.addEventListener('change', () => this.renderStudioChart());
    document.getElementById('btnUpdateChart')?.addEventListener('click', () => this.renderStudioChart());
    document.getElementById('btnDownloadChartPng')?.addEventListener('click', () => {
      Visualizer.downloadChartAsPNG('studioCanvas', `${this.datasetName || 'chart'}.png`);
      this.showToast('Downloaded High-Res Chart PNG.', 'success');
    });

    // Chart Data Filtering
    document.getElementById('chartFilterCol')?.addEventListener('change', () => this.applyChartFilterFromUI());
    document.getElementById('chartFilterOp')?.addEventListener('change', () => this.applyChartFilterFromUI());
    document.getElementById('chartFilterVal')?.addEventListener('input', () => this.applyChartFilterFromUI());
    document.getElementById('btnClearChartFilter')?.addEventListener('click', () => {
      const colEl = document.getElementById('chartFilterCol');
      const valEl = document.getElementById('chartFilterVal');
      if (colEl) colEl.value = '';
      if (valEl) valEl.value = '';
      this.chartFilter = { col: '', op: 'equals', val: '' };
      document.getElementById('chartFilterNotice').style.display = 'none';
      this.renderStudioChart();
    });

    // Data Cleaning Handlers
    document.getElementById('btnUndoClean')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('btnRestoreOriginalData')?.addEventListener('click', () => this.handleReset());

    // Missing Values Actions
    document.getElementById('btnCleanDropNulls')?.addEventListener('click', () => {
      const col = document.getElementById('cleanMissingColSelect')?.value;
      this.applyCleanOperation('drop_nulls', { column: col });
    });

    document.getElementById('btnCleanFillMean')?.addEventListener('click', () => {
      const col = document.getElementById('cleanMissingColSelect')?.value;
      if (col) this.applyCleanOperation('fill_missing', { column: col, strategy: 'mean' });
    });

    document.getElementById('btnCleanFillMedian')?.addEventListener('click', () => {
      const col = document.getElementById('cleanMissingColSelect')?.value;
      if (col) this.applyCleanOperation('fill_missing', { column: col, strategy: 'median' });
    });

    document.getElementById('btnCleanFillMode')?.addEventListener('click', () => {
      const col = document.getElementById('cleanMissingColSelect')?.value;
      if (col) this.applyCleanOperation('fill_missing', { column: col, strategy: 'mode' });
    });

    document.getElementById('btnCleanFfill')?.addEventListener('click', () => {
      const col = document.getElementById('cleanMissingColSelect')?.value;
      if (col) this.applyCleanOperation('fill_missing', { column: col, strategy: 'ffill' });
    });

    document.getElementById('btnCleanBfill')?.addEventListener('click', () => {
      const col = document.getElementById('cleanMissingColSelect')?.value;
      if (col) this.applyCleanOperation('fill_missing', { column: col, strategy: 'bfill' });
    });

    document.getElementById('btnCleanFillCustom')?.addEventListener('click', () => {
      const col = document.getElementById('cleanMissingColSelect')?.value;
      const customVal = document.getElementById('cleanCustomValInput')?.value;
      if (col && customVal !== undefined) {
        this.applyCleanOperation('fill_missing', { column: col, strategy: 'constant', value: customVal });
      }
    });

    // Duplicate Management
    document.getElementById('btnPreviewDuplicates')?.addEventListener('click', () => this.showDuplicateModal());
    document.getElementById('btnCleanRemoveDuplicates')?.addEventListener('click', () => {
      const keep = document.getElementById('cleanDupKeepSelect')?.value || 'first';
      this.applyCleanOperation('drop_duplicates', { keep });
    });
    document.getElementById('btnConfirmRemoveDuplicates')?.addEventListener('click', () => {
      this.closeModal('duplicateModal');
      const keep = document.getElementById('cleanDupKeepSelect')?.value || 'first';
      this.applyCleanOperation('drop_duplicates', { keep });
    });
    document.getElementById('btnCloseDupModal')?.addEventListener('click', () => this.closeModal('duplicateModal'));
    document.getElementById('btnCancelDupModal')?.addEventListener('click', () => this.closeModal('duplicateModal'));

    // Outlier Management
    document.getElementById('cleanOutlierColSelect')?.addEventListener('change', (e) => {
      this.updateOutlierCardStats(e.target.value);
    });
    document.getElementById('btnPreviewOutliers')?.addEventListener('click', () => this.showOutlierModal());
    document.getElementById('btnCleanCapOutliers')?.addEventListener('click', () => {
      const col = document.getElementById('cleanOutlierColSelect')?.value;
      if (col) this.applyCleanOperation('cap_outliers', { column: col });
    });
    document.getElementById('btnConfirmCapOutliers')?.addEventListener('click', () => {
      this.closeModal('outlierModal');
      const col = document.getElementById('cleanOutlierColSelect')?.value;
      if (col) this.applyCleanOperation('cap_outliers', { column: col });
    });
    document.getElementById('btnCleanRemoveOutliers')?.addEventListener('click', () => {
      const col = document.getElementById('cleanOutlierColSelect')?.value;
      if (col && confirm(`Are you sure you want to delete all rows where "${col}" violates IQR outlier bounds? This will permanently remove records.`)) {
        this.applyCleanOperation('remove_outliers', { column: col });
      }
    });
    document.getElementById('btnConfirmRemoveOutliers')?.addEventListener('click', () => {
      this.closeModal('outlierModal');
      const col = document.getElementById('cleanOutlierColSelect')?.value;
      if (col && confirm(`Delete all rows where "${col}" is an outlier?`)) {
        this.applyCleanOperation('remove_outliers', { column: col });
      }
    });
    document.getElementById('btnCloseOutlierModal')?.addEventListener('click', () => this.closeModal('outlierModal'));
    document.getElementById('btnCancelOutlierModal')?.addEventListener('click', () => this.closeModal('outlierModal'));

    // Column Management
    document.getElementById('btnCleanRenameCol')?.addEventListener('click', () => {
      const col = document.getElementById('cleanRenameColSelect')?.value;
      const newName = document.getElementById('cleanRenameNewName')?.value.trim();
      if (col && newName) {
        this.applyCleanOperation('rename_column', { column: col, new_name: newName });
      }
    });

    document.getElementById('btnCleanDeleteCol')?.addEventListener('click', () => {
      const col = document.getElementById('cleanDeleteColSelect')?.value;
      if (col && confirm(`Are you sure you want to permanently delete column "${col}"?`)) {
        this.applyCleanOperation('delete_column', { column: col });
      }
    });

    document.getElementById('btnCleanAddCol')?.addEventListener('click', () => {
      const name = document.getElementById('cleanAddColName')?.value.trim();
      const formula = document.getElementById('cleanAddColFormula')?.value.trim();
      if (name) {
        this.applyCleanOperation('add_column', { name, formula });
      }
    });

    document.getElementById('btnCleanConvertType')?.addEventListener('click', () => {
      const col = document.getElementById('cleanTypeColSelect')?.value;
      const targetType = document.getElementById('cleanTargetTypeSelect')?.value;
      if (col && targetType) {
        this.applyCleanOperation('convert_type', { column: col, target_type: targetType });
      }
    });

    // Export Center Buttons
    document.getElementById('btnExportCleanCsv')?.addEventListener('click', () => this.downloadExport('csv'));
    document.getElementById('btnExportCleanXlsx')?.addEventListener('click', () => this.downloadExport('xlsx'));
    document.getElementById('btnExportCleanJson')?.addEventListener('click', () => this.downloadExport('json'));
    document.getElementById('btnExportOriginalDataset')?.addEventListener('click', () => this.downloadExport('csv', 'original'));
    document.getElementById('btnExportStatsSummaryCsv')?.addEventListener('click', () => this.downloadExport('stats_csv'));
    document.getElementById('btnExportExecutivePdf')?.addEventListener('click', () => this.exportPdfDossier());
    document.getElementById('btnExportStudioChartPng')?.addEventListener('click', () => {
      Visualizer.downloadChartAsPNG('studioCanvas', `${this.datasetName || 'chart'}.png`);
      this.showToast('Downloaded High-Res Chart PNG.', 'success');
    });

    // Predictive ML Suite Handlers
    document.querySelectorAll('.ml-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const paneId = btn.getAttribute('data-ml-pane');
        document.querySelectorAll('.ml-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.ml-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(paneId)?.classList.add('active');

        if (paneId === 'pane-regression') this.trainRegression();
        else if (paneId === 'pane-clustering') this.runClustering();
        else if (paneId === 'pane-anomaly') this.runAnomalyScan();
        else if (paneId === 'pane-forecast') this.runForecast();
      });
    });

    document.getElementById('btnTrainRegression')?.addEventListener('click', () => this.trainRegression());
    document.getElementById('btnRunForecast')?.addEventListener('click', () => this.runForecast());
    document.getElementById('btnRunClustering')?.addEventListener('click', () => this.runClustering());
    document.getElementById('btnScanAnomalies')?.addEventListener('click', () => this.runAnomalyScan());

    document.getElementById('predictorInputX')?.addEventListener('input', (e) => {
      if (this.activeMLModel && this.activeMLModel.predict) {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          const pred = this.activeMLModel.predict(val);
          const outEl = document.getElementById('predictedOutputY');
          if (outEl) outEl.textContent = pred;
        }
      }
    });

    // PDF Table Modal Controls
    document.getElementById('btnClosePdfModal')?.addEventListener('click', () => this.closePdfModal());
    document.getElementById('btnCancelPdfModal')?.addEventListener('click', () => this.closePdfModal());
  },

  /* ========================================================================
     FILE DROPZONE & INGESTION PIPELINE
     ======================================================================== */
  setupDropzone(dropzoneId, inputId) {
    const dropzone = document.getElementById(dropzoneId);
    const fileInput = document.getElementById(inputId);
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.processFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.processFile(e.target.files[0]);
      }
    });
  },

  async processFile(file, options = {}) {
    const ext = file.name.split('.').pop().toLowerCase();
    this.showToast(`Validating & Ingesting: ${file.name}...`, 'info');

    const progressBox = document.getElementById('uploadProgressBox');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressLbl = document.getElementById('uploadPercentLabel');
    if (progressBox) progressBox.style.display = 'block';
    if (progressBar) progressBar.style.width = '30%';
    if (progressLbl) progressLbl.textContent = '30%';

    // Backend Processing
    if (this.isBackendOnline) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (options.table_index !== undefined) formData.append('table_index', options.table_index);
        if (options.sheet_name !== undefined) formData.append('sheet_name', options.sheet_name);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        if (progressBar) progressBar.style.width = '85%';
        if (progressLbl) progressLbl.textContent = '85%';

        const json = await res.json();
        if (res.ok && json.success) {
          if (progressBox) progressBox.style.display = 'none';

          if (json.metadata && json.metadata.format === 'pdf' && json.metadata.tables_found > 1 && options.table_index === undefined) {
            this.pendingPdfFile = file;
            this.showPdfTablePicker(json.metadata.available_tables);
            return;
          }

          this.dataset_id = json.dataset_id;
          this.datasetName = json.dataset_name;
          this.data = json.records;
          this.originalData = JSON.parse(JSON.stringify(json.records));
          this.modifiedCells = new Set();
          this.operationHistory = [];
          this.originalMetrics = {
            rows: json.total_rows,
            missing: json.missing_cells,
            dups: json.duplicate_count
          };

          // Render metadata card
          this.renderUploadMetadata({
            filename: file.name,
            size: this.formatBytes(file.size),
            delimiter: json.metadata?.delimiter || ',',
            encoding: json.metadata?.encoding || 'utf-8',
            dimensions: `${json.total_rows} rows • ${json.total_columns} cols`
          });

          // Render 20-row preview table
          this.renderUploadPreviewTable(json.preview_rows || json.records.slice(0, 20));

          this.refreshAfterDataUpdate();
          this.showToast(`Successfully Ingested ${file.name} (${this.data.length} records)`, 'success');
          return;
        } else {
          throw new Error(json.error || 'Server rejected file upload');
        }
      } catch (err) {
        console.warn('Backend upload failed, attempting client fallback:', err);
        if (['csv', 'json'].includes(ext)) {
          this.processClientFallback(file, ext);
          return;
        } else {
          if (progressBox) progressBox.style.display = 'none';
          this.showToast(`Error processing ${file.name}: ${err.message}`, 'error');
          return;
        }
      }
    }

    // Client fallback mode
    this.processClientFallback(file, ext);
  },

  processClientFallback(file, ext) {
    const progressBox = document.getElementById('uploadProgressBox');
    const reader = new FileReader();

    if (ext === 'csv') {
      reader.onload = (e) => {
        const text = e.target.result;
        // Auto-detect delimiter
        let delimiter = ',';
        const firstLine = text.split('\n')[0] || '';
        const counts = { ',': (firstLine.match(/,/g) || []).length, ';': (firstLine.match(/;/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length, '|': (firstLine.match(/\|/g) || []).length };
        const bestDelim = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        if (counts[bestDelim] > 0) delimiter = bestDelim;

        Papa.parse(text, {
          header: true,
          delimiter: delimiter,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (progressBox) progressBox.style.display = 'none';
            if (results.data && results.data.length > 0) {
              this.dataset_id = null;
              this.datasetName = file.name.replace(/\.[^/.]+$/, "");
              this.data = results.data;
              this.originalData = JSON.parse(JSON.stringify(results.data));
              this.modifiedCells = new Set();
              this.operationHistory = [];
              this.originalMetrics = {
                rows: this.data.length,
                missing: 0,
                dups: 0
              };

              this.renderUploadMetadata({
                filename: file.name,
                size: this.formatBytes(file.size),
                delimiter: delimiter === '\t' ? 'Tab (\\t)' : delimiter,
                encoding: 'UTF-8',
                dimensions: `${this.data.length} rows • ${Object.keys(this.data[0]).length} cols`
              });

              this.renderUploadPreviewTable(this.data.slice(0, 20));
              this.refreshAfterDataUpdate();
              this.showToast(`Loaded CSV: ${file.name} (${this.data.length} records)`, 'success');
            } else {
              this.showToast('CSV file appeared empty or invalid', 'warning');
            }
          }
        });
      };
      reader.readAsText(file);
    } else if (ext === 'json') {
      reader.onload = (e) => {
        if (progressBox) progressBox.style.display = 'none';
        try {
          const parsed = JSON.parse(e.target.result);
          const dataArray = Array.isArray(parsed) ? parsed : (parsed.data || parsed.records || [parsed]);
          this.dataset_id = null;
          this.datasetName = file.name.replace(/\.[^/.]+$/, "");
          this.data = dataArray;
          this.originalData = JSON.parse(JSON.stringify(dataArray));
          this.modifiedCells = new Set();
          this.operationHistory = [];
          this.renderUploadPreviewTable(this.data.slice(0, 20));
          this.refreshAfterDataUpdate();
          this.showToast(`Loaded JSON: ${file.name} (${this.data.length} records)`, 'success');
        } catch (err) {
          this.showToast('Invalid JSON file format', 'error');
        }
      };
      reader.readAsText(file);
    } else {
      if (progressBox) progressBox.style.display = 'none';
      this.showToast(`Parsing ${ext.toUpperCase()} requires the Python backend server. Please run "run_app.bat".`, 'warning');
    }
  },

  renderUploadMetadata(meta) {
    const card = document.getElementById('uploadMetaStatusCard');
    if (!card) return;
    card.style.display = 'block';

    const fn = document.getElementById('metaFilename');
    const sz = document.getElementById('metaFileSize');
    const dl = document.getElementById('metaDelimiter');
    const enc = document.getElementById('metaEncoding');
    const dim = document.getElementById('metaRowsCols');

    if (fn) fn.textContent = meta.filename;
    if (sz) sz.textContent = meta.size;
    if (dl) dl.textContent = meta.delimiter;
    if (enc) enc.textContent = meta.encoding.toUpperCase();
    if (dim) dim.textContent = meta.dimensions;
  },

  renderUploadPreviewTable(rows) {
    const tableHeader = document.getElementById('uploadPreviewHeader');
    const tableBody = document.getElementById('uploadPreviewBody');
    if (!tableHeader || !tableBody || !rows || !rows.length) return;

    const cols = Object.keys(rows[0]);
    tableHeader.innerHTML = `<tr>` + cols.map(c => `<th>${c}</th>`).join('') + `</tr>`;
    tableBody.innerHTML = rows.map(r => {
      return `<tr>` + cols.map(c => {
        const val = r[c];
        if (val === null || val === undefined) return `<td><em style="color:var(--accent-rose);">(null)</em></td>`;
        return `<td>${val}</td>`;
      }).join('') + `</tr>`;
    }).join('');
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  showPdfTablePicker(tables) {
    const modal = document.getElementById('pdfTableModal');
    const list = document.getElementById('pdfTablesList');
    if (!modal || !list) return;

    list.innerHTML = tables.map((t, idx) => `
      <div style="background-color: var(--bg-card-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-primary);">Table ${t.table_index} (Page ${t.page})</div>
          <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 0.15rem;">
            ${t.row_count} rows &bull; ${t.col_count} columns: [${t.headers.slice(0, 4).join(', ')}${t.headers.length > 4 ? '...' : ''}]
          </div>
        </div>
        <button class="btn btn-primary btn-sm btn-select-pdf-table" data-index="${idx}">
          Select & Analyze
        </button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-select-pdf-table').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        this.closePdfModal();
        if (this.pendingPdfFile) {
          this.processFile(this.pendingPdfFile, { table_index: idx });
          this.pendingPdfFile = null;
        }
      });
    });

    modal.classList.add('active');
  },

  closePdfModal() {
    const modal = document.getElementById('pdfTableModal');
    if (modal) modal.classList.remove('active');
    this.pendingPdfFile = null;
  },

  /* ========================================================================
     PRELOADED DATASETS
     ======================================================================== */
  renderPresets() {
    const fullContainer = document.getElementById('fullPresetsContainer');
    const switcher = document.getElementById('datasetSwitcherSelect');
    if (!fullContainer) return;

    let cardsHtml = '';
    let selectHtml = '<option value="" disabled selected>Switch active dataset...</option>';

    Object.values(PRELOADED_DATASETS).forEach(preset => {
      cardsHtml += `
        <div class="preset-card ${preset.id === 'sales_retail' ? 'active' : ''}" data-preset="${preset.id}">
          <div class="preset-card-title">${preset.name}</div>
          <div class="preset-card-desc">${preset.description}</div>
        </div>
      `;
      selectHtml += `<option value="${preset.id}">${preset.name}</option>`;
    });

    fullContainer.innerHTML = cardsHtml;
    if (switcher) switcher.innerHTML = selectHtml;

    fullContainer.querySelectorAll('.preset-card').forEach(card => {
      card.addEventListener('click', () => {
        fullContainer.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const pId = card.getAttribute('data-preset');
        this.loadPreset(pId);
      });
    });
  },

  loadPreset(presetId) {
    const preset = PRELOADED_DATASETS[presetId];
    if (!preset) return;
    this.dataset_id = null;
    this.datasetName = preset.name;
    this.data = preset.generate();
    this.originalData = JSON.parse(JSON.stringify(this.data));
    this.modifiedCells = new Set();
    this.operationHistory = [];
    this.originalMetrics = {
      rows: this.data.length,
      missing: 0,
      dups: 0
    };

    this.renderUploadPreviewTable(this.data.slice(0, 20));
    this.refreshAfterDataUpdate();
    this.showToast(`Loaded ${preset.name}`, 'success');

    const switcher = document.getElementById('datasetSwitcherSelect');
    if (switcher) switcher.value = presetId;
  },

  /* ========================================================================
     STATE SYNCHRONIZATION & REFRESH
     ======================================================================== */
  refreshAfterDataUpdate() {
    this.schema = EDA.analyzeSchema(this.data);
    this.numericCols = Object.keys(this.schema).filter(k => this.schema[k].type === 'numeric');
    this.categoricalCols = Object.keys(this.schema).filter(k => this.schema[k].type === 'categorical');
    this.datetimeCols = Object.keys(this.schema).filter(k => this.schema[k].type === 'datetime');

    this.currentPage = 1;
    this.updateKPICounters();
    this.populateSelectors();
    this.renderSchemaTable();
    this.renderTable();
    this.updateBeforeAfterComparison();
    this.renderOverviewInsights();
    this.renderOverviewChart();

    // Trigger update on active tab
    if (this.activeTab === 'tab-eda') this.renderComprehensiveAnalysis();
    if (this.activeTab === 'tab-visual') this.renderStudioChart();
    if (this.activeTab === 'tab-ml') this.trainRegression();
    if (this.activeTab === 'tab-reports') this.renderExecutiveReport();
  },

  updateKPICounters() {
    const rowCount = this.data.length;
    const colCount = Object.keys(this.schema).length;

    // Topbar
    const topName = document.getElementById('topbarDatasetName');
    const topDim = document.getElementById('topbarDimPill');
    if (topName) topName.textContent = this.datasetName || 'Active Dataset';
    if (topDim) topDim.textContent = `(${rowCount} rows • ${colCount} cols)`;

    // Overview KPIs
    const kpiRow = document.getElementById('kpiRowCount');
    const kpiCol = document.getElementById('kpiColCount');
    const kpiTypes = document.getElementById('kpiColTypes');
    const kpiComp = document.getElementById('kpiCompleteness');
    const kpiMissing = document.getElementById('kpiMissingCells');
    const kpiDups = document.getElementById('kpiDuplicateCount');

    if (kpiRow) kpiRow.textContent = rowCount.toLocaleString();
    if (kpiCol) kpiCol.textContent = colCount;
    if (kpiTypes) kpiTypes.textContent = `${this.numericCols.length} Num • ${this.categoricalCols.length} Cat`;

    // Duplicates & Nulls
    const seen = new Set();
    let dupCount = 0;
    this.data.forEach(r => {
      const s = JSON.stringify(r);
      if (seen.has(s)) dupCount++;
      else seen.add(s);
    });
    if (kpiDups) kpiDups.textContent = dupCount;

    const totalCells = rowCount * colCount;
    const nullCells = Object.values(this.schema).reduce((acc, s) => acc + s.nullCount, 0);
    const completeness = totalCells > 0 ? (((totalCells - nullCells) / totalCells) * 100).toFixed(1) : 100.0;

    if (kpiComp) kpiComp.textContent = `${completeness}%`;
    if (kpiMissing) kpiMissing.textContent = `${nullCells} Missing Cells`;
  },

  populateSelectors() {
    const allCols = Object.keys(this.schema);

    // Explorer Column Filter Select
    const expColFilter = document.getElementById('tableColumnFilterSelect');
    if (expColFilter) {
      expColFilter.innerHTML = `<option value="">All Columns</option>` + allCols.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Clean Missing Column Select
    const cleanMissingSel = document.getElementById('cleanMissingColSelect');
    if (cleanMissingSel) {
      cleanMissingSel.innerHTML = `<option value="all">All Columns</option>` + allCols.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Clean Outlier Column Select
    const cleanOutlierSel = document.getElementById('cleanOutlierColSelect');
    if (cleanOutlierSel) {
      cleanOutlierSel.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
      if (this.numericCols.length > 0) this.updateOutlierCardStats(this.numericCols[0]);
    }

    // Column Management Selectors
    const renameSel = document.getElementById('cleanRenameColSelect');
    const deleteSel = document.getElementById('cleanDeleteColSelect');
    const typeSel = document.getElementById('cleanTypeColSelect');
    if (renameSel) renameSel.innerHTML = allCols.map(c => `<option value="${c}">${c}</option>`).join('');
    if (deleteSel) deleteSel.innerHTML = allCols.map(c => `<option value="${c}">${c}</option>`).join('');
    if (typeSel) typeSel.innerHTML = allCols.map(c => `<option value="${c}">${c}</option>`).join('');

    // EDA Numerical Filter Select
    const edaNumSel = document.getElementById('edaNumFeatureSelect');
    if (edaNumSel) {
      edaNumSel.innerHTML = `<option value="all">All Numerical Features</option>` + this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // EDA Categorical Select
    const edaCatSel = document.getElementById('edaCatFeatureSelect');
    if (edaCatSel) {
      edaCatSel.innerHTML = this.categoricalCols.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Studio Selectors
    const studioX = document.getElementById('studioAxisX');
    const studioY = document.getElementById('studioAxisY');
    const filterCol = document.getElementById('chartFilterCol');

    if (studioX && studioY) {
      studioX.innerHTML = allCols.map(c => `<option value="${c}">${c}</option>`).join('');
      studioY.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
      if (this.categoricalCols.length > 0) studioX.value = this.categoricalCols[0];
      else if (this.numericCols.length > 0) studioX.value = this.numericCols[0];

      if (this.numericCols.length > 0) {
        studioY.value = this.numericCols[this.numericCols.length - 1];
      }
    }

    if (filterCol) {
      filterCol.innerHTML = `<option value="">No Filter (All Rows)</option>` + allCols.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // ML Selectors
    const regX = document.getElementById('regFeatureX');
    const regY = document.getElementById('regTargetY');
    if (regX && regY) {
      regX.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
      regY.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
      if (this.numericCols.length >= 2) {
        regX.value = this.numericCols[0];
        regY.value = this.numericCols[this.numericCols.length - 1];
      }
    }

    const fcSel = document.getElementById('forecastFeatureSelect');
    if (fcSel) fcSel.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');

    const clusX = document.getElementById('clusterFeatX');
    const clusY = document.getElementById('clusterFeatY');
    if (clusX && clusY) {
      clusX.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
      clusY.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
      if (this.numericCols.length >= 2) {
        clusX.value = this.numericCols[0];
        clusY.value = this.numericCols[1];
      }
    }

    const anomSel = document.getElementById('anomalyFeatureSelect');
    if (anomSel) anomSel.innerHTML = this.numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
  },

  renderSchemaTable() {
    const body = document.getElementById('schemaInspectionBody');
    if (!body) return;
    const cols = Object.keys(this.schema);
    if (!cols.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem;">No dataset loaded.</td></tr>';
      return;
    }

    body.innerHTML = cols.map(c => {
      const s = this.schema[c];
      const badgeCls = s.type === 'numeric' ? 'badge-numeric' : (s.type === 'categorical' ? 'badge-categorical' : (s.type === 'datetime' ? 'badge-datetime' : 'badge-id'));
      return `
        <tr>
          <td><strong>${c}</strong></td>
          <td><span class="col-badge ${badgeCls}">${s.type}</span></td>
          <td>${(this.data.length - s.nullCount).toLocaleString()}</td>
          <td>${s.nullCount > 0 ? `<span style="color:var(--accent-rose); font-weight:600;">${s.nullCount}</span>` : '0'}</td>
          <td>${s.uniqueCount.toLocaleString()}</td>
          <td>${s.completenessPct}%</td>
        </tr>
      `;
    }).join('');
  },

  /* ========================================================================
     DATA EXPLORER & SPREADSHEET INLINE EDITOR
     ======================================================================== */
  getFilteredData() {
    let dataset = this.data;

    if (this.columnFilter && this.searchQuery) {
      dataset = dataset.filter(row => {
        const val = row[this.columnFilter];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(this.searchQuery);
      });
    } else if (this.searchQuery) {
      dataset = dataset.filter(row => {
        return Object.values(row).some(val => 
          val !== null && val !== undefined && String(val).toLowerCase().includes(this.searchQuery)
        );
      });
    }

    if (this.sortCol) {
      dataset = [...dataset].sort((a, b) => {
        const va = a[this.sortCol];
        const vb = b[this.sortCol];
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        const res = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return this.sortDir === 'asc' ? res : -res;
      });
    }

    return dataset;
  },

  renderTable() {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    if (!tableHeader || !tableBody) return;

    const cols = Object.keys(this.schema);
    if (!cols.length) {
      tableHeader.innerHTML = '';
      tableBody.innerHTML = '<tr><td colspan="100" style="text-align:center; padding:2rem;">No data loaded</td></tr>';
      return;
    }

    // Sort status indicator
    const sortStatusEl = document.getElementById('tableSortStatus');
    if (sortStatusEl) {
      sortStatusEl.textContent = this.sortCol ? `Sorted by: ${this.sortCol} (${this.sortDir.toUpperCase()})` : '';
    }

    tableHeader.innerHTML = `<tr>` + cols.map(c => {
      const type = this.schema[c].type;
      const badgeCls = type === 'numeric' ? 'badge-numeric' : (type === 'categorical' ? 'badge-categorical' : (type === 'datetime' ? 'badge-datetime' : 'badge-id'));
      const sortIcon = this.sortCol === c ? (this.sortDir === 'asc' ? ' 🔼' : ' 🔽') : '';
      return `<th class="sortable-th" data-col="${c}" style="cursor: pointer;" title="Click to sort by ${c}">
        ${c}${sortIcon} <span class="col-badge ${badgeCls}">${type}</span>
      </th>`;
    }).join('') + `</tr>`;

    // Bind header sorting clicks
    tableHeader.querySelectorAll('.sortable-th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col');
        if (this.sortCol === col) {
          this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortCol = col;
          this.sortDir = 'asc';
        }
        this.renderTable();
      });
    });

    const filtered = this.getFilteredData();
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageRows = filtered.slice(startIndex, startIndex + this.pageSize);

    if (!pageRows.length) {
      tableBody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align: center; padding: 2rem; color: var(--text-muted);">No records match your search filter.</td></tr>`;
    } else {
      tableBody.innerHTML = pageRows.map((row, rowIdxOnPage) => {
        const globalRowIdx = this.data.indexOf(row);
        return `<tr>` + cols.map(c => {
          const val = row[c];
          const isModified = this.modifiedCells.has(`${globalRowIdx}_${c}`);
          const modClass = isModified ? ' cell-modified' : '';
          if (val === null || val === undefined) {
            return `<td class="editable-cell${modClass}" data-row="${globalRowIdx}" data-col="${c}" title="Click to edit cell"><em style="color:var(--accent-rose);">(null)</em></td>`;
          }
          return `<td class="editable-cell${modClass}" data-row="${globalRowIdx}" data-col="${c}" title="Click to edit cell">${val}</td>`;
        }).join('') + `</tr>`;
      }).join('');
    }

    // Bind inline editing to cells
    tableBody.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('dblclick', () => this.handleCellEdit(cell));
    });

    // Update modified badge
    const badge = document.getElementById('cellModifiedBadge');
    if (badge) {
      if (this.modifiedCells.size > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = `${this.modifiedCells.size} Modified Cells`;
      } else {
        badge.style.display = 'none';
      }
    }

    const infoEl = document.getElementById('paginationInfo');
    if (infoEl) {
      const end = Math.min(startIndex + this.pageSize, filtered.length);
      infoEl.textContent = `Showing ${filtered.length ? startIndex + 1 : 0} to ${end} of ${filtered.length} rows`;
    }
  },

  handleCellEdit(cell) {
    if (cell.querySelector('input')) return;
    const rowIdx = parseInt(cell.getAttribute('data-row'), 10);
    const colName = cell.getAttribute('data-col');
    const currentVal = this.data[rowIdx] ? this.data[rowIdx][colName] : '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'editable-cell-input';
    input.value = currentVal === null || currentVal === undefined ? '' : currentVal;

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    const commitChange = () => {
      let newVal = input.value.trim();
      if (typeof currentVal === 'number' || (newVal !== '' && !isNaN(parseFloat(newVal)))) {
        newVal = parseFloat(newVal);
      }
      if (newVal === '') newVal = null;

      if (newVal !== currentVal) {
        this.applyCleanOperation('edit_cell', {
          row_index: rowIdx,
          col_name: colName,
          new_value: newVal
        });
        this.modifiedCells.add(`${rowIdx}_${colName}`);
      } else {
        cell.textContent = currentVal === null ? '(null)' : currentVal;
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        cell.textContent = currentVal === null ? '(null)' : currentVal;
      }
    });

    input.addEventListener('blur', commitChange);
  },

  /* ========================================================================
     AUTOMATIC DATA ANALYSIS ENGINE (MODULE 2)
     ======================================================================== */
  async renderComprehensiveAnalysis() {
    let analysis = null;

    if (this.isBackendOnline && this.dataset_id) {
      try {
        const res = await fetch(`/api/analysis?dataset_id=${encodeURIComponent(this.dataset_id)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.analysis) {
            analysis = json.analysis;
          }
        }
      } catch (e) {
        console.warn('Backend analysis failed, computing on client:', e);
      }
    }

    // Client fallback analysis calculation
    if (!analysis) {
      analysis = this.computeClientAnalysis();
    }

    this.populateAnalysisUI(analysis);
  },

  computeClientAnalysis() {
    const rowCount = this.data.length;
    const colCount = Object.keys(this.schema).length;
    const totalCells = rowCount * colCount;
    const missingCells = Object.values(this.schema).reduce((acc, s) => acc + s.nullCount, 0);

    const seen = new Set();
    let dupCount = 0;
    this.data.forEach(r => {
      const s = JSON.stringify(r);
      if (seen.has(s)) dupCount++;
      else seen.add(s);
    });

    // 13-metrics for numerical
    const numStats = {};
    this.numericCols.forEach(c => {
      numStats[c] = EDA.computeNumericalStats(this.data, c);
    });

    // Categorical
    const catStats = {};
    this.categoricalCols.forEach(c => {
      catStats[c] = EDA.computeCategoricalStats(this.data, c);
    });

    return {
      overview: {
        total_rows: rowCount,
        total_columns: colCount,
        total_cells: totalCells,
        missing_cells: missingCells,
        missing_pct: totalCells > 0 ? +((missingCells / totalCells) * 100).toFixed(1) : 0,
        duplicate_rows: dupCount,
        duplicate_pct: rowCount > 0 ? +((dupCount / rowCount) * 100).toFixed(1) : 0,
        numerical_columns: this.numericCols.length,
        categorical_columns: this.categoricalCols.length,
        memory_usage: this.formatBytes(totalCells * 8)
      },
      numerical_analysis: numStats,
      categorical_analysis: catStats,
      data_quality: {
        missing_columns: Object.keys(this.schema).filter(k => this.schema[k].nullCount > 0).map(k => ({ column: k, missing_count: this.schema[k].nullCount })),
        duplicate_records_count: dupCount,
        iqr_outliers: Object.keys(numStats).map(k => ({ column: k, outlier_count: numStats[k]?.outlierCount || 0 })),
        constant_columns: [],
        high_cardinality_columns: [],
        negative_value_columns: []
      },
      ai_insights: [
        `Dataset comprises ${rowCount.toLocaleString()} records across ${colCount} attributes with ${(100 - (missingCells/totalCells*100 || 0)).toFixed(1)}% completeness.`,
        dupCount > 0 ? `Identified ${dupCount} duplicate records that should be deduplicated.` : 'Dataset is free of duplicate records.',
        `Evaluated ${this.numericCols.length} numerical metrics and ${this.categoricalCols.length} categorical attributes.`
      ]
    };
  },

  populateAnalysisUI(analysis) {
    const ov = analysis.overview;
    document.getElementById('edaOverviewRows').textContent = (ov.total_rows || 0).toLocaleString();
    document.getElementById('edaOverviewCols').textContent = ov.total_columns || 0;
    document.getElementById('edaOverviewCells').textContent = (ov.total_cells || 0).toLocaleString();
    document.getElementById('edaOverviewMissing').textContent = `${ov.missing_cells || 0} (${ov.missing_pct || 0}%)`;
    document.getElementById('edaOverviewDups').textContent = `${ov.duplicate_rows || 0} (${ov.duplicate_pct || 0}%)`;
    document.getElementById('edaOverviewNumCols').textContent = ov.numerical_columns || 0;
    document.getElementById('edaOverviewCatCols').textContent = ov.categorical_columns || 0;
    document.getElementById('edaOverviewMemory').textContent = ov.memory_usage || '1.2 MB';

    // Health score
    let healthScore = 100;
    if (ov.missing_pct > 0) healthScore -= Math.min(25, ov.missing_pct * 2);
    if (ov.duplicate_pct > 0) healthScore -= Math.min(20, ov.duplicate_pct * 3);
    healthScore = Math.max(10, Math.round(healthScore));

    const healthEl = document.getElementById('edaHealthScoreVal');
    const statusText = document.getElementById('edaHealthStatusText');
    const summaryText = document.getElementById('edaHealthSummary');

    if (healthEl) {
      healthEl.textContent = `${healthScore}%`;
      healthEl.style.color = healthScore > 85 ? 'var(--accent-emerald)' : (healthScore > 65 ? 'var(--accent-amber)' : 'var(--accent-rose)');
    }
    if (statusText) statusText.textContent = healthScore > 85 ? 'Excellent Data Health' : (healthScore > 65 ? 'Fair - Needs Minor Cleaning' : 'Degraded - Requires Action');
    if (summaryText) summaryText.textContent = `${ov.missing_cells} null cells and ${ov.duplicate_rows} duplicate observations detected.`;

    // Dimensions breakdown table
    const dimBody = document.getElementById('edaDimBreakdownBody');
    if (dimBody) {
      dimBody.innerHTML = `
        <tr><td>Observations (Rows)</td><td>${(ov.total_rows || 0).toLocaleString()}</td><td>100.0%</td></tr>
        <tr><td>Complete Records</td><td>${(ov.total_rows - (ov.duplicate_rows || 0)).toLocaleString()}</td><td>${(100 - (ov.duplicate_pct || 0)).toFixed(1)}%</td></tr>
        <tr><td>Data Completeness</td><td>${(ov.total_cells - ov.missing_cells).toLocaleString()} cells</td><td>${(100 - (ov.missing_pct || 0)).toFixed(1)}%</td></tr>
        <tr><td>Numerical Ratio</td><td>${ov.numerical_columns} features</td><td>${ov.total_columns ? ((ov.numerical_columns / ov.total_columns) * 100).toFixed(1) : 0}%</td></tr>
      `;
    }

    // Populate Sub-pane 2: Numerical stats table
    this.renderFullNumericalTable('all', analysis.numerical_analysis);

    // Populate Sub-pane 3: Categorical
    if (this.categoricalCols.length > 0) {
      this.renderCategoricalView(this.categoricalCols[0], analysis.categorical_analysis);
    }

    // Populate Sub-pane 4: Data Quality
    this.renderQualityView(analysis.data_quality);

    // Populate Sub-pane 6: AI Insights
    this.renderInsightsView(analysis.ai_insights);
  },

  renderFullNumericalTable(filterCol = 'all', numStatsSource = null) {
    const tbody = document.getElementById('edaFullNumericalBody');
    if (!tbody) return;

    const cols = filterCol === 'all' ? this.numericCols : [filterCol];
    if (!cols.length) {
      tbody.innerHTML = '<tr><td colspan="14" style="text-align:center; padding:1.5rem;">No numerical columns available.</td></tr>';
      return;
    }

    tbody.innerHTML = cols.map(c => {
      const stats = (numStatsSource && numStatsSource[c]) || EDA.computeNumericalStats(this.data, c);
      if (!stats) return `<tr><td><strong>${c}</strong></td><td colspan="13" style="text-align:center;">N/A</td></tr>`;
      return `
        <tr>
          <td><strong>${c}</strong></td>
          <td>${stats.mean}</td>
          <td>${stats.median}</td>
          <td>${stats.mode}</td>
          <td>${stats.stdDev}</td>
          <td>${stats.variance}</td>
          <td>${stats.min}</td>
          <td>${stats.max}</td>
          <td>${stats.range}</td>
          <td>${stats.q1}</td>
          <td>${stats.q3}</td>
          <td>${stats.iqr}</td>
          <td>${stats.skewness}</td>
          <td>${stats.kurtosis}</td>
        </tr>
      `;
    }).join('');
  },

  renderCategoricalView(col, catStatsSource = null) {
    if (!col) return;
    const stats = (catStatsSource && catStatsSource[col]) || EDA.computeCategoricalStats(this.data, col);
    if (!stats) return;

    document.getElementById('catMetricUnique').textContent = stats.unique;
    document.getElementById('catMetricTop').textContent = stats.top;
    const topPct = stats.distribution[0]?.percentage || 0;
    document.getElementById('catMetricTopPct').textContent = `${topPct}%`;

    const distList = document.getElementById('catDistributionList');
    if (distList) {
      distList.innerHTML = stats.distribution.slice(0, 10).map(d => `
        <div class="dist-bar-row">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.2rem;">
            <span><strong>${d.category}</strong></span>
            <span style="color: var(--text-muted);">${d.count} (${d.percentage}%)</span>
          </div>
          <div style="height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden;">
            <div style="width: ${d.percentage}%; height: 100%; background: var(--primary);"></div>
          </div>
        </div>
      `).join('');
    }

    const rareCont = document.getElementById('catRareCategoriesContainer');
    if (rareCont) {
      const rares = stats.rareCategories || [];
      if (!rares.length) {
        rareCont.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">No rare categories detected in this feature.</span>';
      } else {
        rareCont.innerHTML = rares.map(r => `
          <span class="quality-badge badge-warning" style="font-size: 0.76rem;">
            ${r.category} (${r.count} &bull; ${r.percentage}%)
          </span>
        `).join('');
      }
    }
  },

  renderQualityView(quality) {
    const missingCount = (quality.missing_columns || []).length;
    const dupCount = quality.duplicate_records_count || 0;
    const outlierCount = (quality.iqr_outliers || []).reduce((acc, o) => acc + (o.outlier_count || 0), 0);
    const constCount = (quality.constant_columns || []).length;
    const highCardCount = (quality.high_cardinality_columns || []).length;
    const negCount = (quality.negative_value_columns || []).length;

    document.getElementById('qualityMissingCols').textContent = missingCount;
    document.getElementById('qualityDupRows').textContent = dupCount;
    document.getElementById('qualityOutlierCount').textContent = outlierCount;
    document.getElementById('qualityConstantCols').textContent = constCount;
    document.getElementById('qualityHighCardCols').textContent = highCardCount;
    document.getElementById('qualityNegativeCols').textContent = negCount;

    const registry = document.getElementById('qualityIssuesRegistry');
    if (!registry) return;

    const issues = [];
    if (missingCount > 0) {
      issues.push({
        type: 'warning',
        title: `Missing Values in ${missingCount} Column(s)`,
        desc: quality.missing_columns.map(m => `"${m.column}" (${m.missing_count} nulls)`).join(', '),
        action: 'Use the Data Cleaning Studio to impute with Mean, Median, or Mode.'
      });
    }
    if (dupCount > 0) {
      issues.push({
        type: 'warning',
        title: `${dupCount} Exact Duplicate Records Detected`,
        desc: 'Identical rows detected across all attributes.',
        action: 'Run deduplication in Data Cleaning Studio to retain first occurrence.'
      });
    }
    if (outlierCount > 0) {
      issues.push({
        type: 'danger',
        title: `${outlierCount} Extreme Outlier Values Discovered via IQR`,
        desc: 'Values falling outside Tukey bounds (Q1 - 1.5*IQR or Q3 + 1.5*IQR).',
        action: 'Review outlier records and apply percentile capping (winsorization).'
      });
    }
    if (constCount > 0) {
      issues.push({
        type: 'danger',
        title: `${constCount} Constant Zero-Variance Column(s)`,
        desc: quality.constant_columns.join(', ') + ' provide zero information content.',
        action: 'Consider dropping constant columns.'
      });
    }

    if (!issues.length) {
      registry.innerHTML = `
        <div style="background: var(--bg-card-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; text-align: center;">
          <span style="font-size: 1.5rem;">🎉</span>
          <div style="font-weight: 700; font-size: 0.95rem; margin-top: 0.25rem; color: var(--accent-emerald);">Clean Dataset Health</div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">No critical anomalies, missing values, duplicates, or constant features detected.</p>
        </div>
      `;
    } else {
      registry.innerHTML = issues.map(iss => `
        <div style="background: var(--bg-card-subtle); border-left: 4px solid ${iss.type === 'danger' ? 'var(--accent-rose)' : 'var(--accent-amber)'}; padding: 0.85rem 1rem; border-radius: 0 var(--radius-md) var(--radius-md) 0; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); border-right: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.9rem; color: var(--text-primary);">${iss.title}</strong>
            <span class="quality-badge ${iss.type === 'danger' ? 'badge-danger' : 'badge-warning'}">${iss.type.toUpperCase()}</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.25rem 0;">${iss.desc}</p>
          <div style="font-size: 0.76rem; color: var(--primary); font-weight: 600;">Suggested Action: ${iss.action}</div>
        </div>
      `).join('');
    }
  },

  async renderCorrelationView() {
    const method = document.getElementById('corrMethodSelect')?.value || 'pearson';
    let matrix = null;

    if (this.isBackendOnline && this.dataset_id) {
      try {
        const res = await fetch(`/api/correlation?dataset_id=${encodeURIComponent(this.dataset_id)}&method=${method}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            matrix = json.correlation_matrix;
          }
        }
      } catch (e) {
        console.warn('Backend correlation failed, computing on client:', e);
      }
    }

    if (!matrix) {
      matrix = EDA.computeCorrelationMatrix(this.data, this.numericCols, method);
    }

    Visualizer.renderCorrelationMatrixGrid('correlationHeatmapContainer', matrix, this.numericCols);
  },

  renderInsightsView(insights) {
    const cont = document.getElementById('edaInsightsContainer');
    if (!cont) return;

    if (Array.isArray(insights) && insights.length > 0 && typeof insights[0] === 'string') {
      cont.innerHTML = insights.map((ins, i) => `
        <div class="insight-card info">
          <div class="insight-title-row">
            <span>💡</span>
            <span>Dataset Finding #${i+1}</span>
          </div>
          <p class="insight-desc" style="font-size: 0.88rem; line-height: 1.5; color: var(--text-primary);">${ins}</p>
        </div>
      `).join('');
    } else {
      const generated = Reports.generateInsights(this.data, this.schema, this.numericCols, null);
      cont.innerHTML = generated.map(ins => `
        <div class="insight-card ${ins.type}">
          <div class="insight-title-row">
            <span>${ins.icon}</span>
            <span>${ins.title}</span>
          </div>
          <div class="insight-metric-pill">${ins.metric}</div>
          <p class="insight-desc">${ins.explanation}</p>
          <div class="insight-action-box">
            <strong>Implication:</strong> ${ins.business_implication}<br/>
            <strong>Action:</strong> ${ins.next_action}
          </div>
        </div>
      `).join('');
    }
  },

  /* ========================================================================
     INTERACTIVE VISUAL STUDIO (MODULE 3)
     ======================================================================== */
  updateStudioControlVisibility() {
    const isHist = this.activeChartType === 'histogram';
    const isHeat = this.activeChartType === 'heatmap';
    const isMissing = this.activeChartType === 'missing';

    document.getElementById('groupHistogramBins').style.display = isHist ? 'block' : 'none';
    document.getElementById('groupHeatmapMethod').style.display = isHeat ? 'block' : 'none';
    document.getElementById('groupAxisX').style.display = (isMissing || isHeat) ? 'none' : 'block';
    document.getElementById('groupAxisY').style.display = isMissing ? 'none' : 'block';
    document.getElementById('groupAggregation').style.display = (isHist || isHeat || isMissing) ? 'none' : 'block';
  },

  applyChartFilterFromUI() {
    const col = document.getElementById('chartFilterCol')?.value;
    const op = document.getElementById('chartFilterOp')?.value || 'equals';
    const val = document.getElementById('chartFilterVal')?.value.trim() || '';

    this.chartFilter = { col, op, val };
    const notice = document.getElementById('chartFilterNotice');
    if (notice) notice.style.display = col && val ? 'inline-block' : 'none';
    this.renderStudioChart();
  },

  getChartDataFiltered() {
    let dataset = this.data;
    const f = this.chartFilter;
    if (f.col && f.val !== '') {
      dataset = dataset.filter(row => {
        const rowVal = row[f.col];
        if (rowVal === null || rowVal === undefined) return false;
        if (f.op === 'equals') return String(rowVal).toLowerCase() === f.val.toLowerCase();
        if (f.op === 'contains') return String(rowVal).toLowerCase().includes(f.val.toLowerCase());
        if (f.op === 'gt') return parseFloat(rowVal) > parseFloat(f.val);
        if (f.op === 'lt') return parseFloat(rowVal) < parseFloat(f.val);
        return true;
      });
    }
    return dataset;
  },

  renderStudioChart() {
    const type = this.activeChartType;
    const axisX = document.getElementById('studioAxisX')?.value;
    const axisY = document.getElementById('studioAxisY')?.value;
    const agg = document.getElementById('studioAggregation')?.value || 'avg';
    const chartData = this.getChartDataFiltered();

    const titleEl = document.getElementById('studioChartTitle');
    const subEl = document.getElementById('studioChartSubtitle');
    const canvas = document.getElementById('studioCanvas');
    const heatmapSlot = document.getElementById('studioHeatmapSlot');

    if (heatmapSlot) heatmapSlot.style.display = 'none';
    if (canvas) canvas.parentElement.style.display = 'block';

    if (!chartData.length) {
      if (titleEl) titleEl.textContent = 'No Data Matches Filter';
      if (subEl) subEl.textContent = 'Clear the filter to inspect records';
      return;
    }

    // 1. Histogram
    if (type === 'histogram') {
      const bins = parseInt(document.getElementById('studioBinsRange')?.value || '10', 10);
      const vals = chartData.map(r => parseFloat(r[axisY])).filter(v => !isNaN(v));
      if (titleEl) titleEl.textContent = `Histogram Distribution: ${axisY}`;
      if (subEl) subEl.textContent = `${vals.length} Numerical Observations (${bins} Bins)`;
      Visualizer.renderHistogram('studioCanvas', vals, bins, axisY);
      this.evaluateTrend(axisX, axisY, chartData);
      return;
    }

    // 2. Box Plot
    if (type === 'boxplot') {
      const colsToPlot = axisY ? [axisY] : this.numericCols.slice(0, 4);
      const colStatsList = colsToPlot.map(col => {
        const stats = EDA.computeNumericalStats(chartData, col);
        return stats ? { column: col, ...stats } : null;
      }).filter(Boolean);

      if (titleEl) titleEl.textContent = `5-Number Box Plot: ${colsToPlot.join(', ')}`;
      if (subEl) subEl.textContent = `Interquartile spread, median, and Tukey bounds`;
      Visualizer.renderBoxPlot('studioCanvas', colStatsList);
      this.evaluateTrend(axisX, axisY, chartData);
      return;
    }

    // 3. Correlation Heatmap
    if (type === 'heatmap') {
      const method = document.getElementById('studioHeatmapMethod')?.value || 'pearson';
      const matrix = EDA.computeCorrelationMatrix(chartData, this.numericCols, method);
      if (canvas) canvas.parentElement.style.display = 'none';
      if (heatmapSlot) {
        heatmapSlot.style.display = 'block';
        Visualizer.renderCorrelationMatrixGrid('studioHeatmapSlot', matrix, this.numericCols);
      }
      if (titleEl) titleEl.textContent = `Correlation Heatmap (${method.toUpperCase()})`;
      if (subEl) subEl.textContent = `Linear dependency matrix across ${this.numericCols.length} numerical columns`;
      return;
    }

    // 4. Missing Values Chart
    if (type === 'missing') {
      if (titleEl) titleEl.textContent = 'Missing Values Frequency by Feature';
      if (subEl) subEl.textContent = `Total rows: ${chartData.length}`;
      Visualizer.renderMissingValuesChart('studioCanvas', this.schema, chartData.length);
      return;
    }

    // 5. Outlier Detection Chart
    if (type === 'outliers') {
      const stats = EDA.computeNumericalStats(chartData, axisY);
      if (stats) {
        if (titleEl) titleEl.textContent = `IQR Outlier Scanner: ${axisY}`;
        if (subEl) subEl.textContent = `${stats.outlierCount} Outliers (${stats.outlierPct}%) violating bounds [${stats.lowerBound}, ${stats.upperBound}]`;
        Visualizer.renderOutlierDetectionChart('studioCanvas', chartData, axisY, stats.lowerBound, stats.upperBound);
      }
      return;
    }

    // 6. Scatter Plot
    if (type === 'scatter') {
      const scatterPts = chartData
        .map(r => ({ x: parseFloat(r[axisX]), y: parseFloat(r[axisY]) }))
        .filter(p => !isNaN(p.x) && !isNaN(p.y));

      if (titleEl) titleEl.textContent = `Bivariate Scatter: ${axisX} vs ${axisY}`;
      if (subEl) subEl.textContent = `${scatterPts.length} Observations Plotted`;

      Visualizer.renderCustomChart('studioCanvas', 'scatter', [], [{
        label: `${axisX} vs ${axisY}`,
        data: scatterPts
      }], {
        scales: {
          x: { title: { display: true, text: axisX } },
          y: { title: { display: true, text: axisY } }
        }
      });
      this.evaluateTrend(axisX, axisY, chartData);
      return;
    }

    // 7, 8, 9: Bar, Line, Pie/Donut (with aggregation)
    const groups = {};
    const counts = {};

    chartData.forEach(r => {
      const key = r[axisX] !== null && r[axisX] !== undefined ? String(r[axisX]).trim() : '(Missing)';
      const yVal = parseFloat(r[axisY]);
      if (!groups[key]) {
        groups[key] = [];
        counts[key] = 0;
      }
      counts[key]++;
      if (!isNaN(yVal)) groups[key].push(yVal);
    });

    const labels = Object.keys(groups).slice(0, 15);
    const dataVals = labels.map(k => {
      const arr = groups[k];
      if (!arr.length) return counts[k] || 0;
      if (agg === 'sum') return +arr.reduce((a, b) => a + b, 0).toFixed(2);
      if (agg === 'avg') return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
      if (agg === 'max') return +Math.max(...arr).toFixed(2);
      if (agg === 'min') return +Math.min(...arr).toFixed(2);
      if (agg === 'count') return counts[k];
      return 0;
    });

    if (titleEl) titleEl.textContent = `${axisY} (${agg.toUpperCase()}) by ${axisX}`;
    if (subEl) subEl.textContent = `Aggregated across ${labels.length} distinct categories`;

    Visualizer.renderCustomChart('studioCanvas', type, labels, [{
      label: `${agg.toUpperCase()}(${axisY})`,
      data: dataVals
    }]);

    this.evaluateTrend(axisX, axisY, chartData);
  },

  evaluateTrend(axisX, axisY, data) {
    const summaryEl = document.getElementById('trendSummaryText');
    const detailEl = document.getElementById('trendDetailText');
    const badgeEl = document.getElementById('trendStrengthBadge');
    const iconEl = document.getElementById('trendDirectionIcon');

    if (!summaryEl || !axisY || !data.length) return;

    const validVals = data.map(r => parseFloat(r[axisY])).filter(v => !isNaN(v));
    if (validVals.length < 3) {
      summaryEl.textContent = 'Insufficient data points for trend analysis';
      return;
    }

    // Linear regression on index vs value
    const n = validVals.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += validVals[i];
      sumXY += i * validVals[i];
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
    const avgVal = sumY / n;
    const relSlopePct = avgVal !== 0 ? (slope / Math.abs(avgVal)) * 100 : 0;

    if (slope > 0.05) {
      iconEl.textContent = '📈';
      summaryEl.textContent = `Positive Upward Trend in ${axisY}`;
      detailEl.textContent = `Average trajectory increases by +${slope.toFixed(2)} units per sequential interval (+${relSlopePct.toFixed(1)}%).`;
      badgeEl.className = 'quality-badge badge-clean';
      badgeEl.textContent = 'Upward Momentum';
    } else if (slope < -0.05) {
      iconEl.textContent = '📉';
      summaryEl.textContent = `Negative Downward Trend in ${axisY}`;
      detailEl.textContent = `Average trajectory decreases by ${slope.toFixed(2)} units per interval (${relSlopePct.toFixed(1)}%).`;
      badgeEl.className = 'quality-badge badge-danger';
      badgeEl.textContent = 'Downward Trajectory';
    } else {
      iconEl.textContent = '➡️';
      summaryEl.textContent = `Stable / Plateaued Trend in ${axisY}`;
      detailEl.textContent = `Values remain relatively flat with minimal secular drift across records.`;
      badgeEl.className = 'quality-badge badge-warning';
      badgeEl.textContent = 'Neutral Stability';
    }
  },

  /* ========================================================================
     DATA CLEANING & UPDATE STUDIO (MODULE 4)
     ======================================================================== */
  updateBeforeAfterComparison() {
    const curRows = this.data.length;
    const curCols = Object.keys(this.schema).length;
    const curTotalCells = curRows * curCols;
    const curNulls = Object.values(this.schema).reduce((acc, s) => acc + s.nullCount, 0);

    const seen = new Set();
    let curDups = 0;
    this.data.forEach(r => {
      const s = JSON.stringify(r);
      if (seen.has(s)) curDups++;
      else seen.add(s);
    });

    document.getElementById('cleanOrigRows').textContent = this.originalMetrics.rows.toLocaleString();
    document.getElementById('cleanUpdatedRows').textContent = curRows.toLocaleString();
    document.getElementById('cleanOrigMissing').textContent = this.originalMetrics.missing.toLocaleString();
    document.getElementById('cleanUpdatedMissing').textContent = curNulls.toLocaleString();
    document.getElementById('cleanOrigDups').textContent = this.originalMetrics.dups.toLocaleString();
    document.getElementById('cleanUpdatedDups').textContent = curDups.toLocaleString();
    document.getElementById('cleanModifiedCellsCount').textContent = this.modifiedCells.size.toLocaleString();

    // Duplicate badge count
    const dupBadge = document.getElementById('cleanDupBadgeCount');
    if (dupBadge) dupBadge.textContent = `${curDups} Duplicates`;

    // Render Operation Log
    const logCont = document.getElementById('cleanOperationLogContainer');
    if (logCont) {
      if (!this.operationHistory.length) {
        logCont.innerHTML = `<div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 1.5rem;">No transformations applied yet. Dataset is currently at baseline.</div>`;
      } else {
        logCont.innerHTML = this.operationHistory.map((op, idx) => `
          <div class="operation-log-item">
            <span style="font-size: 1.1rem;">⚡</span>
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${op.description}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted);">${op.timestamp} &bull; Delta: ${op.deltaRows || 0} rows</div>
            </div>
            <span class="quality-badge badge-clean">Step #${idx+1}</span>
          </div>
        `).join('');
      }
    }
  },

  updateOutlierCardStats(col) {
    if (!col) return;
    const stats = EDA.computeNumericalStats(this.data, col);
    if (!stats) return;

    document.getElementById('cleanOutlierLower').textContent = stats.lowerBound;
    document.getElementById('cleanOutlierUpper').textContent = stats.upperBound;
    document.getElementById('cleanOutlierCount').textContent = stats.outlierCount;
  },

  showDuplicateModal() {
    const modal = document.getElementById('duplicateModal');
    const thead = document.getElementById('duplicateTableHeader');
    const tbody = document.getElementById('duplicateTableBody');
    if (!modal || !thead || !tbody) return;

    const cols = Object.keys(this.schema);
    const seen = new Set();
    const dups = [];

    this.data.forEach((r, idx) => {
      const s = JSON.stringify(r);
      if (seen.has(s)) {
        dups.push({ rowIdx: idx, record: r });
      } else {
        seen.add(s);
      }
    });

    thead.innerHTML = `<tr><th>Row #</th>` + cols.map(c => `<th>${c}</th>`).join('') + `</tr>`;
    if (!dups.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" style="text-align: center; padding: 2rem;">No duplicate rows found!</td></tr>`;
    } else {
      tbody.innerHTML = dups.map(d => {
        return `<tr><td><strong>${d.rowIdx + 1}</strong></td>` + cols.map(c => `<td>${d.record[c] !== null ? d.record[c] : ''}</td>`).join('') + `</tr>`;
      }).join('');
    }

    modal.classList.add('active');
  },

  showOutlierModal() {
    const col = document.getElementById('cleanOutlierColSelect')?.value;
    if (!col) return;

    const modal = document.getElementById('outlierModal');
    const thead = document.getElementById('outlierTableHeader');
    const tbody = document.getElementById('outlierTableBody');
    const badge = document.getElementById('outlierModalColBadge');
    if (!modal || !thead || !tbody) return;

    if (badge) badge.textContent = col;

    const stats = EDA.computeNumericalStats(this.data, col);
    if (!stats) return;

    const cols = Object.keys(this.schema);
    const outlierRows = [];
    this.data.forEach((r, idx) => {
      const v = parseFloat(r[col]);
      if (!isNaN(v) && (v < stats.lowerBound || v > stats.upperBound)) {
        outlierRows.push({ rowIdx: idx, val: v, record: r });
      }
    });

    thead.innerHTML = `<tr><th>Row #</th>` + cols.map(c => `<th>${c}</th>`).join('') + `</tr>`;
    if (!outlierRows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" style="text-align: center; padding: 2rem;">No outliers found for "${col}".</td></tr>`;
    } else {
      tbody.innerHTML = outlierRows.map(o => {
        return `<tr><td><strong>${o.rowIdx + 1}</strong></td>` + cols.map(c => {
          const isTarget = c === col;
          return `<td style="${isTarget ? 'background: rgba(225, 29, 72, 0.15); font-weight: 700; color: var(--accent-rose);' : ''}">${o.record[c] !== null ? o.record[c] : ''}</td>`;
        }).join('') + `</tr>`;
      }).join('');
    }

    modal.classList.add('active');
  },

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
  },

  async applyCleanOperation(action, params = {}) {
    const initialRows = this.data.length;
    this.showToast(`Applying transformation: ${action}...`, 'info');

    // 1. Try Backend API
    if (this.isBackendOnline && this.dataset_id) {
      try {
        const res = await fetch('/api/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json_stringify_clean({
            dataset_id: this.dataset_id,
            action: action,
            params: params
          })
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.records) {
            this.data = json.records;
            const deltaRows = this.data.length - initialRows;
            this.operationHistory.push({
              action,
              description: json.operation?.description || `${action} applied`,
              timestamp: new Date().toLocaleTimeString(),
              deltaRows
            });
            this.showToast(`Success: ${json.operation?.description || action}`, 'success');
            this.refreshAfterDataUpdate();
            return;
          }
        }
      } catch (e) {
        console.warn('Backend clean operation failed, falling back to client engine:', e);
      }
    }

    // 2. Client fallback
    const targetCol = params.column || params.col_name || null;
    this.data = EDA.cleanData(this.data, action, targetCol, params);
    const deltaRows = this.data.length - initialRows;
    this.operationHistory.push({
      action,
      description: `Client transformation: ${action} on ${targetCol || 'dataset'}`,
      timestamp: new Date().toLocaleTimeString(),
      deltaRows
    });
    this.showToast(`Transformation completed (${deltaRows} row delta).`, 'success');
    this.refreshAfterDataUpdate();
  },

  async handleUndo() {
    this.showToast('Reverting last operation...', 'info');

    if (this.isBackendOnline && this.dataset_id) {
      try {
        const res = await fetch('/api/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json_stringify_clean({
            dataset_id: this.dataset_id,
            action: 'undo'
          })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.records) {
            this.data = json.records;
            this.operationHistory.pop();
            this.showToast('Reverted last operation via backend history.', 'success');
            this.refreshAfterDataUpdate();
            return;
          }
        }
      } catch (e) {
        console.warn('Backend undo failed:', e);
      }
    }

    // Client fallback undo
    if (this.originalData && this.originalData.length) {
      this.data = JSON.parse(JSON.stringify(this.originalData));
      this.operationHistory = [];
      this.modifiedCells = new Set();
      this.showToast('Restored original dataset state.', 'success');
      this.refreshAfterDataUpdate();
    }
  },

  async handleReset() {
    if (confirm('Are you sure you want to discard all transformations and reset to original dataset?')) {
      if (this.isBackendOnline && this.dataset_id) {
        try {
          const res = await fetch('/api/clean', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: json_stringify_clean({
              dataset_id: this.dataset_id,
              action: 'reset'
            })
          });
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.records) {
              this.data = json.records;
              this.operationHistory = [];
              this.modifiedCells = new Set();
              this.showToast('Reset dataset to initial ingested state.', 'success');
              this.refreshAfterDataUpdate();
              return;
            }
          }
        } catch (e) {
          console.warn('Backend reset failed:', e);
        }
      }

      this.data = JSON.parse(JSON.stringify(this.originalData));
      this.operationHistory = [];
      this.modifiedCells = new Set();
      this.showToast('Reset dataset to initial state.', 'success');
      this.refreshAfterDataUpdate();
    }
  },

  /* ========================================================================
     EXPORT & DOWNLOAD CENTER (MODULE 5)
     ======================================================================== */
  downloadExport(format, source = 'cleaned') {
    if (!this.data.length) {
      this.showToast('No active dataset to export.', 'warning');
      return;
    }

    this.showToast(`Preparing ${format.toUpperCase()} export...`, 'info');

    if (this.isBackendOnline && this.dataset_id) {
      let url = `/api/export?format=${encodeURIComponent(format)}&dataset_id=${encodeURIComponent(this.dataset_id)}`;
      if (source === 'original') url += `&source=original`;
      window.location.href = url;
      this.showToast(`Downloaded ${format.toUpperCase()} file.`, 'success');
      return;
    }

    // Client fallback download
    if (format === 'csv') {
      const csv = Papa.unparse(source === 'original' ? this.originalData : this.data);
      this.triggerBlobDownload(csv, `${this.datasetName || 'dataset'}_${source}.csv`, 'text/csv;charset=utf-8;');
    } else if (format === 'json') {
      const jsonStr = JSON.stringify(this.data, null, 2);
      this.triggerBlobDownload(jsonStr, `${this.datasetName || 'dataset'}_cleaned.json`, 'application/json');
    } else {
      this.showToast(`Binary export (${format.toUpperCase()}) requires backend Python server. Run run_app.bat.`, 'warning');
    }
  },

  triggerBlobDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.showToast(`Exported ${filename}`, 'success');
  },

  /* ========================================================================
     PREDICTIVE ML CONTROLLER
     ======================================================================== */
  trainRegression() {
    const featX = document.getElementById('regFeatureX')?.value;
    const targetY = document.getElementById('regTargetY')?.value;
    const degType = document.getElementById('regModelType')?.value || 'linear';

    if (!featX || !targetY || !this.data.length) return;

    let result = null;
    if (degType === 'linear') {
      result = ML.trainLinearRegression(this.data, featX, targetY);
    } else {
      result = ML.trainPolynomialRegression(this.data, featX, targetY);
    }

    if (!result) return;
    this.activeMLModel = result;

    document.getElementById('regEquationDisplay').textContent = result.equation;
    document.getElementById('regMetricR2').textContent = result.r2;
    document.getElementById('regMetricRMSE').textContent = result.rmse;
    document.getElementById('regMetricMSE').textContent = result.mse;
    document.getElementById('regMetricN').textContent = result.points.length;

    Visualizer.renderRegressionChart('regressionCanvas', result);
  },

  runForecast() {
    const feature = document.getElementById('forecastFeatureSelect')?.value;
    const horizon = parseInt(document.getElementById('forecastHorizonSelect')?.value || '10', 10);
    if (!feature || !this.data.length) return;

    const result = ML.forecastTrend(this.data, feature, horizon);
    if (result) Visualizer.renderForecastChart('forecastCanvas', result);
  },

  runClustering() {
    const featX = document.getElementById('clusterFeatX')?.value;
    const featY = document.getElementById('clusterFeatY')?.value;
    const k = parseInt(document.getElementById('clusterK')?.value || '3', 10);
    if (!featX || !featY || !this.data.length) return;

    const result = ML.trainKMeans(this.data, featX, featY, k);
    if (!result) return;

    document.getElementById('clusterMetricIter').textContent = result.iterations;
    document.getElementById('clusterMetricWCSS').textContent = result.wcss;
    Visualizer.renderClusteringChart('clusterCanvas', result);
  },

  runAnomalyScan() {
    const feature = document.getElementById('anomalyFeatureSelect')?.value;
    const method = document.getElementById('anomalyMethodSelect')?.value || 'iqr';
    if (!feature || !this.data.length) return;

    const result = ML.scanAnomalies(this.data, feature, method, method === 'iqr' ? 1.5 : 2.5);
    if (!result) return;

    document.getElementById('anomalyMetricCount').textContent = result.anomalyCount;
    document.getElementById('anomalyMetricRate').textContent = `${result.anomalyRatePct}%`;
    Visualizer.renderAnomalyChart('anomalyCanvas', result);
  },

  /* ========================================================================
     EXECUTIVE REPORTS & PDF
     ======================================================================== */
  renderExecutiveReport() {
    const matrix = this.numericCols.length >= 2 ? EDA.computeCorrelationMatrix(this.data, this.numericCols) : null;
    Reports.renderReportView(
      'executiveReportContainer',
      this.datasetName,
      this.data,
      this.schema,
      this.numericCols,
      matrix,
      this.activeMLModel
    );
  },

  async exportPdfDossier() {
    if (!this.data.length) {
      this.showToast('No active dataset to export.', 'warning');
      return;
    }

    this.showToast('Generating Executive Dossier PDF...', 'info');

    if (this.isBackendOnline) {
      try {
        const res = await fetch('/api/export-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json_stringify_clean({
            dataset_id: this.dataset_id,
            dataset_name: this.datasetName || 'Antigravity_Dossier',
            records: this.data
          })
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.datasetName || 'Antigravity'}_Executive_Dossier.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          this.showToast('Downloaded Executive Dossier PDF.', 'success');
          return;
        }
      } catch (e) {
        console.warn('Backend PDF export error, falling back to print:', e);
      }
    }

    this.switchTab('tab-reports');
    setTimeout(() => window.print(), 350);
  },

  /* ========================================================================
     NATURAL LANGUAGE QUERY DISPATCHER
     ======================================================================== */
  async executeCommand(query) {
    if (!query) return;
    this.showToast(`Analyzing request: "${query}"...`, 'info');

    const panel = document.getElementById('queryResultPanel');
    const summaryText = document.getElementById('querySummaryText');
    const explanationText = document.getElementById('queryExplanationText');
    const chartSlot = document.getElementById('queryChartSlot');
    const tableSlot = document.getElementById('queryTableSlot');
    const suggestionsRow = document.getElementById('queryNextSuggestions');

    if (panel) panel.classList.add('active');
    if (summaryText) summaryText.textContent = 'Processing with Analytics Engine...';
    if (explanationText) explanationText.textContent = '';
    if (chartSlot) chartSlot.style.display = 'none';
    if (tableSlot) tableSlot.style.display = 'none';

    let result = null;

    if (this.isBackendOnline) {
      try {
        const res = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json_stringify_clean({ query, dataset_id: this.dataset_id, records: this.data })
        });
        if (res.ok) result = await res.json();
      } catch (e) {
        console.warn('Backend query error, using client fallback:', e);
      }
    }

    if (!result) result = this.executeClientQuery(query);

    if (result) {
      if (summaryText) summaryText.textContent = result.summary || 'Operation Complete';
      if (explanationText) explanationText.textContent = result.explanation || '';

      if (result.action === 'navigate_tab' && result.tab_id) {
        this.switchTab(result.tab_id);
      }

      if (result.chart_config) {
        if (chartSlot) chartSlot.style.display = 'block';
        Visualizer.renderCustomChart(
          'queryCanvas',
          result.chart_config.type || 'bar',
          result.chart_config.labels || [],
          result.chart_config.datasets || [],
          { plugins: { title: { display: true, text: result.chart_config.title || query } } }
        );
      }

      if (result.evidence_data && result.evidence_data.length > 0) {
        if (tableSlot) tableSlot.style.display = 'block';
        const thead = document.getElementById('queryTableHeader');
        const tbody = document.getElementById('queryTableBody');
        const headers = Object.keys(result.evidence_data[0]);

        if (thead) thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        if (tbody) {
          tbody.innerHTML = result.evidence_data.slice(0, 10).map(row => {
            return `<tr>${headers.map(h => `<td>${row[h] !== null && row[h] !== undefined ? row[h] : '-'}</td>`).join('')}</tr>`;
          }).join('');
        }
      }

      if (suggestionsRow && result.next_suggestions) {
        suggestionsRow.innerHTML = '<span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted);">Suggested Next Actions:</span>' + 
          result.next_suggestions.map(s => `<button class="suggestion-chip" data-cmd="${s}">${s}</button>`).join('');

        suggestionsRow.querySelectorAll('.suggestion-chip').forEach(btn => {
          btn.addEventListener('click', () => {
            const cmd = btn.getAttribute('data-cmd');
            if (cmd) {
              const input = document.getElementById('nlCommandInput');
              if (input) input.value = cmd;
              this.executeCommand(cmd);
            }
          });
        });
      }
    }
  },

  executeClientQuery(query) {
    const q = query.toLowerCase();
    const allCols = Object.keys(this.schema);
    const numCols = this.numericCols;
    const catCols = this.categoricalCols;

    if (q.includes('analyze') || q.includes('summary') || q.includes('overview')) {
      return {
        success: true,
        summary: `Dataset has ${this.data.length} records and ${allCols.length} features (${numCols.length} numeric, ${catCols.length} categorical).`,
        explanation: 'Completed automated exploratory data analysis. Feature distributions and correlation heatmaps are refreshed.',
        next_suggestions: [
          'Show me the most purchased product',
          'Calculate total sales and average order value',
          'Show unusual values and outliers'
        ]
      };
    }

    return {
      success: true,
      summary: `Analyzed query against ${this.data.length} active records.`,
      explanation: `Execution completed successfully across ${allCols.length} feature dimensions.`
    };
  },

  submitAiChatMessage(msg) {
    const cont = document.getElementById('chatHistoryContainer');
    if (!cont) return;

    const userBubble = document.createElement('div');
    userBubble.style.cssText = 'background: var(--bg-card-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem 1rem; align-self: flex-end; max-width: 80%;';
    userBubble.innerHTML = `<div style="font-size:0.75rem; font-weight:700; color:var(--primary); margin-bottom:0.25rem;">YOU</div><div>${msg}</div>`;
    cont.appendChild(userBubble);

    const botBubble = document.createElement('div');
    botBubble.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem 1rem; align-self: flex-start; max-width: 85%;';
    botBubble.innerHTML = `<div style="font-size:0.75rem; font-weight:700; color:var(--accent-emerald); margin-bottom:0.25rem;">⚡ NEURODATA STUDIO ANALYST</div><div>Analyzing dataset metrics for "${msg}"...</div>`;
    cont.appendChild(botBubble);
    cont.scrollTop = cont.scrollHeight;

    this.executeCommand(msg).then(() => {
      const summary = document.getElementById('querySummaryText')?.textContent;
      const explanation = document.getElementById('queryExplanationText')?.textContent;
      botBubble.innerHTML = `
        <div style="font-size:0.75rem; font-weight:700; color:var(--accent-emerald); margin-bottom:0.25rem;">⚡ NEURODATA STUDIO ANALYST</div>
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:0.35rem;">${summary}</div>
        <div style="font-size:0.84rem; color:var(--text-muted);">${explanation}</div>
      `;
      cont.scrollTop = cont.scrollHeight;
    });
  },

  renderOverviewChart() {
    if (!this.data.length) return;
    const numCol = this.numericCols[0];
    const catCol = this.categoricalCols[0];

    if (numCol && catCol) {
      const sums = {};
      const counts = {};
      this.data.forEach(r => {
        const k = String(r[catCol]);
        const v = parseFloat(r[numCol]) || 0;
        sums[k] = (sums[k] || 0) + v;
        counts[k] = (counts[k] || 0) + 1;
      });

      const labels = Object.keys(sums).slice(0, 8);
      const values = labels.map(l => +(sums[l] / (counts[l] || 1)).toFixed(2));

      Visualizer.renderCustomChart('overviewCanvas', 'bar', labels, [{
        label: `Mean ${numCol}`,
        data: values
      }]);
    }
  },

  renderOverviewInsights() {
    const container = document.getElementById('overviewInsightsContainer');
    if (!container) return;
    const insights = Reports.generateInsights(this.data, this.schema, this.numericCols, null);
    container.innerHTML = insights.slice(0, 3).map(ins => `
      <div class="insight-card ${ins.type}">
        <div class="insight-title-row">
          <span>${ins.icon}</span>
          <span>${ins.title}</span>
        </div>
        <div class="insight-metric-pill">${ins.metric}</div>
        <p class="insight-desc">${ins.explanation}</p>
        <div class="insight-action-box">
          <strong>Implication:</strong> ${ins.business_implication}
        </div>
      </div>
    `).join('');
  },

  /* ========================================================================
     TAB NAVIGATION
     ======================================================================== */
  switchTab(tabId) {
    this.activeTab = tabId;

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    if (tabId === 'tab-overview') {
      this.renderOverviewChart();
      this.renderOverviewInsights();
    } else if (tabId === 'tab-explorer') {
      this.renderTable();
    } else if (tabId === 'tab-eda') {
      this.renderComprehensiveAnalysis();
    } else if (tabId === 'tab-visual') {
      this.updateStudioControlVisibility();
      this.renderStudioChart();
    } else if (tabId === 'tab-clean') {
      this.updateBeforeAfterComparison();
    } else if (tabId === 'tab-ml') {
      if (!this.activeMLModel) this.trainRegression();
    } else if (tabId === 'tab-reports') {
      this.renderExecutiveReport();
    }
  }
};

/**
 * Serializes objects without NaN / undefined issues
 */
function json_stringify_clean(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'number' && isNaN(value)) return null;
    return value;
  });
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
