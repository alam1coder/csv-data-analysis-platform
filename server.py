"""
NeuroData Studio - Intelligent Data Analytics & Predictive Visualization Platform
High-Performance Local Server with Data Science & ML API Endpoints.
"""

import http.server
import socketserver
import json
import os
import io
import re
import sys
import math
import uuid
import traceback
import urllib.parse
from datetime import datetime
import numpy as np
import pandas as pd

import sys
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Import local data science engine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from backend.data_processor import DataProcessor, HAS_OPENPYXL, HAS_PDFPLUMBER, HAS_PYPDF, HAS_SKLEARN, HAS_REPORTLAB
except ImportError:
    DataProcessor = None
    HAS_OPENPYXL = HAS_PDFPLUMBER = HAS_PYPDF = HAS_SKLEARN = HAS_REPORTLAB = False

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_STORED_DATASETS = 30
ACTIVE_DATASETS = {}


def sanitize_error_message(err: Exception) -> str:
    """Sanitizes internal server paths and sensitive information from client error messages."""
    msg = str(err)
    msg = re.sub(r'[A-Za-z]:\\[^"\'\s<>\)]+', '[internal_path]', msg)
    msg = re.sub(r'/[a-zA-Z0-9_\.\-]+/[a-zA-Z0-9_\.\-]+/[^"\'\s<>\)]+', '[internal_path]', msg)
    return msg


def parse_multipart_body(headers, body_bytes):
    """Robust zero-dependency multipart form-data parser."""
    content_type = headers.get('Content-Type', '')
    boundary = None
    for item in content_type.split(';'):
        item = item.strip()
        if item.startswith('boundary='):
            boundary = item.split('=', 1)[1].strip('"\'')
            break

    if not boundary:
        return {'form': {}, 'files': {}}

    boundary_bytes = ('--' + boundary).encode('latin1')
    parts = body_bytes.split(boundary_bytes)
    files = {}
    form = {}

    for part in parts:
        if not part or part == b'--\r\n' or part == b'--' or part == b'\r\n':
            continue
        # Strip leading newline if present
        if part.startswith(b'\r\n'):
            part = part[2:]
        if b'\r\n\r\n' in part:
            head, val = part.split(b'\r\n\r\n', 1)
            if val.endswith(b'\r\n'):
                val = val[:-2]
            head_str = head.decode('utf-8', errors='replace')

            # Extract field name
            name_match = re.search(r'name=["\']?([^"\';]+)["\']?', head_str)
            filename_match = re.search(r'filename=["\']?([^"\';]+)["\']?', head_str)

            if name_match:
                f_name = name_match.group(1).strip()
                if filename_match:
                    files[f_name] = {
                        'filename': filename_match.group(1).strip(),
                        'content': val
                    }
                else:
                    form[f_name] = val.decode('utf-8', errors='replace')

    return {'form': form, 'files': files}


class NeuroDataHandler(http.server.SimpleHTTPRequestHandler):
    """Handles static web assets and analytical backend REST APIs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS for local cross-origin development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, payload):
        """Helper to send JSON response."""
        json_bytes = json.dumps(payload, default=str).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(json_bytes)))
        self.end_headers()
        self.wfile.write(json_bytes)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/health':
            self.send_json(200, {
                'status': 'healthy',
                'service': 'NeuroData Studio Backend',
                'python_version': sys.version,
                'libraries': {
                    'pandas': True,
                    'openpyxl': HAS_OPENPYXL,
                    'pdfplumber': HAS_PDFPLUMBER,
                    'pypdf': HAS_PYPDF,
                    'scikit_learn': HAS_SKLEARN,
                    'reportlab': HAS_REPORTLAB
                }
            })
            return

        # Fallback to standard static file server
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > MAX_UPLOAD_SIZE:
            self.send_json(413, {'success': False, 'error': 'Payload exceeds maximum limit of 50 MB.'})
            return

        body_bytes = self.rfile.read(content_length) if content_length > 0 else b''

        # -------------------------------------------------------------------
        # 1. API: /api/upload (Smart CSV & Multi-format Ingestion)
        # -------------------------------------------------------------------
        if path == '/api/upload':
            try:
                content_type = self.headers.get('Content-Type', '')
                filename = "dataset.csv"
                file_bytes = b""
                options = {}

                if content_type.startswith('multipart/form-data'):
                    parsed_form = parse_multipart_body(self.headers, body_bytes)
                    files = parsed_form.get('files', {})
                    options = parsed_form.get('form', {})

                    if 'file' in files:
                        file_obj = files['file']
                        filename = file_obj['filename']
                        file_bytes = file_obj['content']
                    elif files:
                        file_obj = next(iter(files.values()))
                        filename = file_obj['filename']
                        file_bytes = file_obj['content']
                    else:
                        self.send_json(400, {'success': False, 'error': 'No file part found in upload request.'})
                        return
                else:
                    try:
                        data = json.loads(body_bytes.decode('utf-8', errors='replace'))
                        filename = data.get('filename', 'dataset.csv')
                        options = data.get('options', {})
                        if 'content_base64' in data:
                            import base64
                            file_bytes = base64.b64decode(data['content_base64'])
                        elif 'content_text' in data:
                            file_bytes = data['content_text'].encode('utf-8')
                        else:
                            self.send_json(400, {'success': False, 'error': 'No content provided in JSON body.'})
                            return
                    except Exception as e:
                        self.send_json(400, {'success': False, 'error': f'Invalid request body: {sanitize_error_message(e)}'})
                        return

                if not file_bytes:
                    self.send_json(400, {'success': False, 'error': 'Uploaded file is empty (0 bytes).'})
                    return

                if len(file_bytes) > MAX_UPLOAD_SIZE:
                    self.send_json(413, {'success': False, 'error': 'File size exceeds maximum limit of 50 MB.'})
                    return

                # Path traversal prevention & safe filename sanitization
                filename = os.path.basename(filename).strip()
                filename = re.sub(r'[^a-zA-Z0-9_.\-\s]', '_', filename)
                if not filename or filename.startswith('.'):
                    filename = f"dataset_{uuid.uuid4().hex[:8]}.csv"

                ext = os.path.splitext(filename)[1].lower()

                if ext in ['.csv', '.tsv', '.txt']:
                    result = DataProcessor.parse_csv(file_bytes, filename)
                elif ext in ['.xlsx', '.xls']:
                    sheet_name = options.get('sheet_name')
                    result = DataProcessor.parse_excel(file_bytes, filename, sheet_name=sheet_name)
                elif ext == '.json':
                    result = DataProcessor.parse_json(file_bytes, filename)
                elif ext == '.pdf':
                    table_index = int(options.get('table_index')) if 'table_index' in options else None
                    result = DataProcessor.parse_pdf(file_bytes, filename, table_index=table_index)
                else:
                    self.send_json(400, {
                        'success': False,
                        'error': f"Unsupported file format '{ext}'. Supported formats are: CSV, Excel (.xlsx, .xls), JSON, and PDF."
                    })
                    return

                # Register in server active dataset store
                dataset_id = result.get('dataset_id')
                if dataset_id and result.get('records'):
                    df_up = pd.DataFrame(result['records'])
                    if len(ACTIVE_DATASETS) >= MAX_STORED_DATASETS:
                        ACTIVE_DATASETS.pop(next(iter(ACTIVE_DATASETS)), None)
                    ACTIVE_DATASETS[dataset_id] = {
                        'id': dataset_id,
                        'filename': filename,
                        'current_df': df_up.copy(),
                        'original_df': df_up.copy(),
                        'history': [],
                        'operations': [],
                        'modified_cells': 0,
                        'initial_rows': len(df_up),
                        'initial_nulls': int(df_up.isna().sum().sum()),
                        'initial_dups': int(df_up.duplicated().sum())
                    }

                self.send_json(200, result)

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Processing error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 2. API: /api/analysis (Automatic Data Analysis Engine - Module 2)
        # -------------------------------------------------------------------
        if path == '/api/analysis':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                elif records:
                    df = pd.DataFrame(records)

                if df is None or len(df) == 0:
                    self.send_json(400, {'success': False, 'error': 'No active dataset or records available for analysis.'})
                    return

                analysis = DataProcessor.compute_comprehensive_analysis(df)
                self.send_json(200, {
                    'success': True,
                    'analysis': analysis
                })

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Analysis error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 3. API: /api/correlation (Interactive Correlation Engine - Module 3)
        # -------------------------------------------------------------------
        if path == '/api/correlation':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')
                method = payload.get('method', 'pearson')

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                elif records:
                    df = pd.DataFrame(records)

                if df is None or len(df) == 0:
                    self.send_json(400, {'success': False, 'error': 'No dataset available for correlation.'})
                    return

                corr_result = DataProcessor.compute_correlation_matrix(df, method=method)
                self.send_json(200, {
                    'success': True,
                    'correlation': corr_result
                })

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Correlation error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 4. API: /api/clean (Data Cleaning & Mutation Studio - Module 4)
        # -------------------------------------------------------------------
        if path == '/api/clean':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                dataset_id = payload.get('dataset_id')
                action = payload.get('action')
                params = payload.get('params', {})
                records = payload.get('records')

                entry = ACTIVE_DATASETS.get(dataset_id) if dataset_id else None
                if entry is not None:
                    df = entry['current_df']
                elif records:
                    df = pd.DataFrame(records)
                else:
                    self.send_json(400, {'success': False, 'error': 'No active dataset or records provided for cleaning.'})
                    return

                if action == 'undo':
                    if entry and entry['history']:
                        prev_snapshot = entry['history'].pop()
                        entry['current_df'] = prev_snapshot['df'].copy()
                        if entry['operations']:
                            entry['operations'].pop()
                        df = entry['current_df']
                        summary = "Undid latest cleaning operation."
                        affected = 0
                    else:
                        self.send_json(400, {'success': False, 'error': 'No operations left to undo.'})
                        return

                elif action == 'reset':
                    if entry:
                        entry['current_df'] = entry['original_df'].copy()
                        entry['history'].clear()
                        entry['operations'].clear()
                        entry['modified_cells'] = 0
                        df = entry['current_df']
                        summary = "Reset dataset to original unmodified state."
                        affected = 0
                    else:
                        self.send_json(400, {'success': False, 'error': 'Cannot reset without active dataset session.'})
                        return

                elif action == 'preview_duplicates':
                    dup_mask = df.duplicated(keep=False)
                    dups = df[dup_mask].head(50).to_dict(orient='records')
                    clean_dups = [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in dups]
                    self.send_json(200, {
                        'success': True,
                        'duplicate_count': int(df.duplicated().sum()),
                        'duplicates': clean_dups
                    })
                    return

                elif action == 'preview_outliers':
                    col = params.get('column')
                    if not col or col not in df.columns:
                        num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
                        col = num_cols[0] if num_cols else None
                    if not col:
                        self.send_json(400, {'success': False, 'error': 'No numerical column found for outlier preview.'})
                        return

                    s_num = pd.to_numeric(df[col], errors='coerce')
                    q1 = float(s_num.quantile(0.25))
                    q3 = float(s_num.quantile(0.75))
                    iqr = q3 - q1
                    l_b = q1 - 1.5 * iqr
                    u_b = q3 + 1.5 * iqr
                    out_mask = (s_num < l_b) | (s_num > u_b)
                    outliers_df = df[out_mask].head(50)
                    clean_outliers = [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in outliers_df.to_dict(orient='records')]

                    self.send_json(200, {
                        'success': True,
                        'column': col,
                        'outlier_count': int(out_mask.sum()),
                        'lower_bound': round(l_b, 2),
                        'upper_bound': round(u_b, 2),
                        'outliers': clean_outliers
                    })
                    return

                else:
                    # Save state for undo
                    if entry:
                        entry['history'].append({'df': df.copy()})
                        if len(entry['history']) > 20:
                            entry['history'].pop(0)

                    new_df, summary, affected = DataProcessor.clean_dataset(df, action, params)
                    df = new_df
                    if entry:
                        entry['current_df'] = df
                        if action == 'edit_cell':
                            entry['modified_cells'] += 1
                        entry['operations'].append({
                            'action': action,
                            'summary': summary,
                            'timestamp': datetime.utcnow().strftime('%H:%M:%S UTC'),
                            'rows_affected': affected
                        })

                # Compute before & after metrics
                if entry:
                    orig_rows = entry['initial_rows']
                    orig_nulls = entry['initial_nulls']
                    orig_dups = entry['initial_dups']
                    mod_cells = entry['modified_cells']
                    ops_list = entry['operations']
                    fn = entry['filename']
                else:
                    orig_rows = len(df)
                    orig_nulls = int(df.isna().sum().sum())
                    orig_dups = int(df.duplicated().sum())
                    mod_cells = 1 if action == 'edit_cell' else 0
                    ops_list = [{'action': action, 'summary': summary, 'timestamp': datetime.utcnow().strftime('%H:%M:%S UTC')}]
                    fn = 'dataset.csv'

                cur_rows = len(df)
                cur_nulls = int(df.isna().sum().sum())
                cur_dups = int(df.duplicated().sum())

                comparison = {
                    'original_rows': orig_rows,
                    'updated_rows': cur_rows,
                    'row_change': cur_rows - orig_rows,
                    'original_missing': orig_nulls,
                    'remaining_missing': cur_nulls,
                    'missing_resolved': orig_nulls - cur_nulls,
                    'original_duplicates': orig_dups,
                    'remaining_duplicates': cur_dups,
                    'duplicates_resolved': orig_dups - cur_dups,
                    'modified_cells': mod_cells,
                    'operations': ops_list
                }

                resp_payload = DataProcessor._prepare_dataset_payload(df, fn)
                if dataset_id:
                    resp_payload['dataset_id'] = dataset_id
                resp_payload['summary'] = summary
                resp_payload['rows_affected'] = affected
                resp_payload['comparison'] = comparison

                self.send_json(200, resp_payload)

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Cleaning error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 5. API: /api/preview (Spreadsheet Editor Paginated Query - Module 4)
        # -------------------------------------------------------------------
        if path == '/api/preview':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')
                page = max(1, int(payload.get('page', 1)))
                page_size = max(5, min(200, int(payload.get('page_size', 10))))
                search = str(payload.get('search', '')).strip().lower()
                sort_by = payload.get('sort_by')
                sort_order = str(payload.get('sort_order', 'asc')).lower()
                filter_col = payload.get('filter_column')
                filter_val = payload.get('filter_value')

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                elif records:
                    df = pd.DataFrame(records)

                if df is None:
                    self.send_json(400, {'success': False, 'error': 'No dataset available for preview.'})
                    return

                filtered_df = df.copy()

                # Column filtering
                if filter_col and filter_col in filtered_df.columns and filter_val is not None and str(filter_val).strip():
                    f_str = str(filter_val).strip().lower()
                    filtered_df = filtered_df[filtered_df[filter_col].astype(str).str.lower().str.contains(f_str, na=False)]

                # Global search across all columns
                if search:
                    mask = pd.Series(False, index=filtered_df.index)
                    for c in filtered_df.columns:
                        mask = mask | filtered_df[c].astype(str).str.lower().str.contains(search, na=False)
                    filtered_df = filtered_df[mask]

                # Sorting
                if sort_by and sort_by in filtered_df.columns:
                    ascending = (sort_order != 'desc')
                    filtered_df = filtered_df.sort_values(by=sort_by, ascending=ascending, na_position='last')

                total_rows = len(filtered_df)
                total_pages = max(1, math.ceil(total_rows / page_size))
                start_idx = (page - 1) * page_size
                end_idx = start_idx + page_size
                page_slice = filtered_df.iloc[start_idx:end_idx]

                rows = []
                for r in page_slice.to_dict(orient='records'):
                    clean_r = {}
                    for k, v in r.items():
                        if pd.isna(v): clean_r[k] = None
                        elif isinstance(v, (np.integer, int)): clean_r[k] = int(v)
                        elif isinstance(v, (np.floating, float)): clean_r[k] = round(float(v), 4)
                        elif isinstance(v, (datetime, pd.Timestamp)): clean_r[k] = v.isoformat()
                        else: clean_r[k] = v
                    rows.append(clean_r)

                self.send_json(200, {
                    'success': True,
                    'page': page,
                    'page_size': page_size,
                    'total_rows': total_rows,
                    'total_pages': total_pages,
                    'columns': list(df.columns),
                    'rows': rows
                })

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Preview error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 6. API: /api/export (Download Center - Module 5)
        # -------------------------------------------------------------------
        if path == '/api/export':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')
                fmt = str(payload.get('format', 'csv')).lower()
                dataset_name = payload.get('dataset_name', 'export_dataset')

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                    dataset_name = ACTIVE_DATASETS[dataset_id]['filename']
                elif records:
                    df = pd.DataFrame(records)

                if df is None:
                    self.send_json(400, {'success': False, 'error': 'No dataset available for export.'})
                    return

                file_bytes, mime_type, filename = DataProcessor.export_dataset(df, format=fmt, dataset_name=dataset_name)

                self.send_response(200)
                self.send_header('Content-Type', mime_type)
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.send_header('Content-Length', str(len(file_bytes)))
                self.end_headers()
                self.wfile.write(file_bytes)

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Export error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 7. API: /api/query (Ask NeuroData AI / NLP Intent Processor)
        # -------------------------------------------------------------------
        if path == '/api/query':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                query = payload.get('query', '')
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')

                if not query:
                    self.send_json(400, {'success': False, 'error': 'Query string cannot be empty.'})
                    return

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                elif records:
                    df = pd.DataFrame(records)

                if df is None or len(df) == 0:
                    self.send_json(400, {'success': False, 'error': 'Dataset cannot be empty.'})
                    return

                result = DataProcessor.execute_nl_query(query, df)
                self.send_json(200, result)

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Command execution error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 8. API: /api/eda (Automated EDA)
        # -------------------------------------------------------------------
        if path == '/api/eda':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                elif records:
                    df = pd.DataFrame(records)

                if df is None or len(df) == 0:
                    self.send_json(400, {'success': False, 'error': 'Dataset cannot be empty.'})
                    return

                eda = DataProcessor.compute_full_eda(df)
                insights = DataProcessor.generate_business_insights(df, eda)

                self.send_json(200, {
                    'success': True,
                    'eda': eda,
                    'insights': insights
                })

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"EDA error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 9. API: /api/predict (Machine Learning & Forecasting Suite)
        # -------------------------------------------------------------------
        if path == '/api/predict':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                model_type = payload.get('model_type', 'regression')
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')
                params = payload.get('params', {})

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                elif records:
                    df = pd.DataFrame(records)

                if df is None or len(df) == 0:
                    self.send_json(400, {'success': False, 'error': 'Dataset cannot be empty.'})
                    return

                if model_type == 'regression':
                    feat_x = params.get('feature_x')
                    target_y = params.get('target_y')
                    degree = int(params.get('degree', 1))
                    res = DataProcessor.train_regression(df, feat_x, target_y, degree=degree)
                elif model_type == 'forecast':
                    feature = params.get('feature')
                    horizon = int(params.get('horizon', 10))
                    res = DataProcessor.train_forecast(df, feature, horizon=horizon)
                else:
                    self.send_json(400, {'success': False, 'error': f"Unknown model type '{model_type}'"})
                    return

                self.send_json(200, {
                    'success': True,
                    'result': res
                })

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"Predictive modeling error: {sanitize_error_message(e)}"
                })
            return

        # -------------------------------------------------------------------
        # 10. API: /api/export-pdf (Executive Dossier PDF)
        # -------------------------------------------------------------------
        if path == '/api/export-pdf':
            try:
                payload = json.loads(body_bytes.decode('utf-8', errors='replace'))
                dataset_id = payload.get('dataset_id')
                records = payload.get('records')
                dataset_name = payload.get('dataset_name', 'Executive_Analysis')

                df = None
                if dataset_id and dataset_id in ACTIVE_DATASETS:
                    df = ACTIVE_DATASETS[dataset_id]['current_df']
                    dataset_name = ACTIVE_DATASETS[dataset_id]['filename']
                elif records:
                    df = pd.DataFrame(records)

                if df is None or len(df) == 0:
                    self.send_json(400, {'success': False, 'error': 'Dataset cannot be empty.'})
                    return

                pdf_bytes = DataProcessor.generate_pdf_dossier(dataset_name, df)

                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', f'attachment; filename="{dataset_name}_Dossier.pdf"')
                self.send_header('Content-Length', str(len(pdf_bytes)))
                self.end_headers()
                self.wfile.write(pdf_bytes)

            except Exception as e:
                traceback.print_exc()
                self.send_json(500, {
                    'success': False,
                    'error': f"PDF export error: {sanitize_error_message(e)}"
                })
            return

        # Unknown POST route
        self.send_json(404, {'success': False, 'error': 'Endpoint not found'})


def run_server():
    """Starts the multi-threaded HTTP server."""
    port = PORT
    for attempt_port in range(port, port + 10):
        try:
            httpd = socketserver.TCPServer(("", attempt_port), NeuroDataHandler)
            port = attempt_port
            break
        except OSError:
            continue

    print(f"[*] NeuroData Studio Server v2.0 running at http://localhost:{port}")
    print(f"   API Endpoints Ready:")
    print(f"   - GET  /api/health")
    print(f"   - POST /api/upload    (CSV, Excel, JSON, PDF)")
    print(f"   - POST /api/query     (Natural Language Analytics)")
    print(f"   - POST /api/eda       (Automated Exploratory Analysis)")
    print(f"   - POST /api/predict   (Regression & Forecasting)")
    print(f"   - POST /api/export-pdf(Publication PDF Dossier)")
    print(f"============================================================")
    print("Press Ctrl+C to stop.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
