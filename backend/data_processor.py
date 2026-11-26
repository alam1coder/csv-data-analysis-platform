"""
NeuroData AI - Core Data Processing, Statistical Analytics, NLP & ML Engine
Supports CSV, Excel (.xlsx, .xls), JSON, and PDF (tables and text extraction).
"""

import os
import io
import re
import json
import csv
import math
import uuid
import numpy as np
import pandas as pd
from datetime import datetime

# Optional external libraries with graceful detection
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

try:
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.cluster import KMeans
    from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error, accuracy_score, precision_score, recall_score, confusion_matrix
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


class DataProcessor:
    """Central analytics processor for parsing, querying, ML, and reporting."""

    @staticmethod
    def _format_memory(num_bytes: int) -> str:
        """Formats memory usage in human-readable units (B, KB, MB, GB)."""
        if num_bytes < 1024:
            return f"{num_bytes} B"
        elif num_bytes < 1024 * 1024:
            return f"{num_bytes / 1024:.1f} KB"
        elif num_bytes < 1024 * 1024 * 1024:
            return f"{num_bytes / (1024 * 1024):.2f} MB"
        else:
            return f"{num_bytes / (1024 * 1024 * 1024):.2f} GB"

    @staticmethod
    def detect_encoding(file_bytes: bytes) -> str:
        """Attempts to detect common file encodings with BOM prioritization."""
        if file_bytes.startswith(b'\xef\xbb\xbf'):
            return 'utf-8-sig'
        if file_bytes.startswith(b'\xff\xfe') or file_bytes.startswith(b'\xfe\xff'):
            return 'utf-16'
        for enc in ['utf-8', 'utf-8-sig', 'latin1', 'cp1252', 'iso-8859-1']:
            try:
                file_bytes.decode(enc)
                return enc
            except (UnicodeDecodeError, LookupError):
                continue
        return 'utf-8'

    @staticmethod
    def detect_delimiter(sample_text: str) -> str:
        """Detects CSV delimiter accurately (comma, semicolon, tab, pipe)."""
        try:
            sniffer = csv.Sniffer()
            dialect = sniffer.sniff(sample_text[:8192])
            if dialect.delimiter in [',', ';', '\t', '|']:
                return dialect.delimiter
        except Exception:
            pass

        # Robust heuristic fallback: evaluate candidate consistency across the first 25 non-empty lines
        lines = [line for line in sample_text.splitlines() if line.strip()][:25]
        if not lines:
            return ','

        candidates = [',', ';', '\t', '|']
        best_cand = ','
        best_score = -1

        for c in candidates:
            counts = [line.count(c) for line in lines]
            total = sum(counts)
            if total == 0:
                continue
            # Non-zero lines ratio
            non_zero_ratio = sum(1 for cnt in counts if cnt > 0) / len(lines)
            if non_zero_ratio >= 0.8:
                # Consistency bonus: variance of counts should be small
                avg_count = total / len(lines)
                variance = sum((cnt - avg_count) ** 2 for cnt in counts) / len(lines)
                consistency = 1.0 / (1.0 + variance)
                score = total * consistency * non_zero_ratio
                if score > best_score:
                    best_score = score
                    best_cand = c

        return best_cand

    @classmethod
    def parse_csv(cls, file_bytes: bytes, filename: str) -> dict:
        """Parses CSV with encoding detection and delimiter sniffing."""
        encoding = cls.detect_encoding(file_bytes)
        text_content = file_bytes.decode(encoding, errors='replace')
        delimiter = cls.detect_delimiter(text_content)

        try:
            df = pd.read_csv(
                io.StringIO(text_content),
                sep=delimiter,
                engine='python',
                on_bad_lines='skip'
            )
        except Exception as e:
            # Secondary fallback with standard C engine
            df = pd.read_csv(
                io.BytesIO(file_bytes),
                encoding=encoding,
                on_bad_lines='skip'
            )

        # Clean column names
        df.columns = [str(c).strip() if str(c).strip() else f"Column_{i+1}" for i, c in enumerate(df.columns)]
        return cls._prepare_dataset_payload(df, filename, metadata={
            'format': 'csv',
            'encoding': encoding,
            'delimiter': repr(delimiter)
        })

    @classmethod
    def parse_excel(cls, file_bytes: bytes, filename: str, sheet_name: str = None) -> dict:
        """Parses Excel workbooks with multiple sheets."""
        if not HAS_OPENPYXL:
            raise RuntimeError("Excel parsing library (openpyxl) is not installed.")

        excel_file = pd.ExcelFile(io.BytesIO(file_bytes), engine='openpyxl')
        available_sheets = excel_file.sheet_names

        selected_sheet = sheet_name if (sheet_name and sheet_name in available_sheets) else available_sheets[0]
        df = pd.read_excel(excel_file, sheet_name=selected_sheet)
        df.columns = [str(c).strip() if str(c).strip() else f"Column_{i+1}" for i, c in enumerate(df.columns)]

        return cls._prepare_dataset_payload(df, filename, metadata={
            'format': 'excel',
            'sheets': available_sheets,
            'active_sheet': selected_sheet
        })

    @classmethod
    def parse_json(cls, file_bytes: bytes, filename: str) -> dict:
        """Parses JSON data (array of objects, record-oriented, or column-oriented)."""
        encoding = cls.detect_encoding(file_bytes)
        text_content = file_bytes.decode(encoding, errors='replace')
        raw_json = json.loads(text_content)

        if isinstance(raw_json, list):
            df = pd.json_normalize(raw_json)
        elif isinstance(raw_json, dict):
            # Check for common wrapper keys
            for key in ['data', 'records', 'rows', 'items', 'results']:
                if key in raw_json and isinstance(raw_json[key], list):
                    df = pd.json_normalize(raw_json[key])
                    break
            else:
                df = pd.DataFrame(raw_json)
        else:
            raise ValueError("Unsupported JSON structure. Expected a list of objects or a dict of records.")

        df.columns = [str(c).strip() if str(c).strip() else f"Column_{i+1}" for i, c in enumerate(df.columns)]
        return cls._prepare_dataset_payload(df, filename, metadata={'format': 'json'})

    @classmethod
    def parse_pdf(cls, file_bytes: bytes, filename: str, table_index: int = None) -> dict:
        """
        Parses text and tables from PDF documents.
        Uses pdfplumber and pypdf to extract structured tables.
        If multiple tables are found, allows picking a table while returning previews.
        If scanned/empty, returns clear guidance regarding OCR.
        """
        if not HAS_PDFPLUMBER:
            raise RuntimeError("PDF extraction library (pdfplumber) is not installed.")

        extracted_tables = []
        raw_text_pages = []

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            total_pages = len(pdf.pages)
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    raw_text_pages.append(f"--- Page {page_num+1} ---\n{text}")

                # Extract tables with multiple strategies
                tables = page.extract_tables()
                if not tables:
                    # Try with explicit vertical/horizontal lines settings
                    tables = page.extract_tables({
                        "vertical_strategy": "text",
                        "horizontal_strategy": "text"
                    })

                for t_idx, table in enumerate(tables or []):
                    if not table or len(table) < 2:
                        continue
                    # Clean table rows: filter out completely None rows
                    cleaned_rows = []
                    for row in table:
                        if any(cell is not None and str(cell).strip() != '' for cell in row):
                            cleaned_rows.append([str(c).strip() if c is not None else '' for c in row])

                    if len(cleaned_rows) >= 2:
                        raw_header = cleaned_rows[0]
                        # Fix empty headers
                        headers = [h if h else f"Col_{c_i+1}" for c_i, h in enumerate(raw_header)]
                        # Ensure unique headers
                        seen = {}
                        unique_headers = []
                        for h in headers:
                            if h in seen:
                                seen[h] += 1
                                unique_headers.append(f"{h}_{seen[h]}")
                            else:
                                seen[h] = 0
                                unique_headers.append(h)

                        rows = cleaned_rows[1:]
                        extracted_tables.append({
                            'id': f"page_{page_num+1}_tbl_{t_idx+1}",
                            'page': page_num + 1,
                            'table_index': t_idx + 1,
                            'headers': unique_headers,
                            'row_count': len(rows),
                            'col_count': len(unique_headers),
                            'sample_rows': rows[:5],
                            'all_rows': rows
                        })

        full_text = "\n\n".join(raw_text_pages).strip()

        # If tables were found:
        if extracted_tables:
            # Pick specified table or default to the largest table (most cells)
            selected_tbl = None
            if table_index is not None and 0 <= table_index < len(extracted_tables):
                selected_tbl = extracted_tables[table_index]
            else:
                selected_tbl = max(extracted_tables, key=lambda t: t['row_count'] * t['col_count'])

            df = pd.DataFrame(selected_tbl['all_rows'], columns=selected_tbl['headers'])
            # Attempt numeric conversion column by column
            for col in df.columns:
                try:
                    num_series = pd.to_numeric(df[col], errors='coerce')
                    if len(df) > 0 and num_series.notna().sum() > 0.5 * len(df):
                        df[col] = num_series
                except Exception:
                    pass

            table_metadata = [{
                'id': t['id'],
                'page': t['page'],
                'table_index': t['table_index'],
                'headers': t['headers'],
                'row_count': t['row_count'],
                'col_count': t['col_count'],
                'preview': t['sample_rows'][:3]
            } for t in extracted_tables]

            return cls._prepare_dataset_payload(df, filename, metadata={
                'format': 'pdf',
                'pages_count': total_pages,
                'tables_found': len(extracted_tables),
                'active_table': selected_tbl['id'],
                'available_tables': table_metadata,
                'has_text': bool(full_text),
                'text_snippet': full_text[:400] if full_text else ''
            })

        # If no tables found, but selectable text exists:
        if full_text:
            # Try to infer structured tabular lines (e.g. key-value pairs or regex space-delimited table)
            lines = [line.strip() for line in full_text.splitlines() if line.strip()]
            records = []
            for line in lines:
                parts = re.split(r'\s{2,}|\t|:', line, maxsplit=1)
                if len(parts) == 2 and len(parts[0]) < 50:
                    records.append({'Attribute': parts[0].strip(), 'Value': parts[1].strip()})

            if len(records) >= 3:
                df = pd.DataFrame(records)
                return cls._prepare_dataset_payload(df, filename, metadata={
                    'format': 'pdf_text_extracted',
                    'pages_count': total_pages,
                    'note': 'Extracted structured attributes from document text.'
                })
            else:
                # Text-only summary dataset
                df = pd.DataFrame({
                    'Paragraph_Number': list(range(1, min(len(lines) + 1, 101))),
                    'Extracted_Content': lines[:100]
                })
                return cls._prepare_dataset_payload(df, filename, metadata={
                    'format': 'pdf_text_summary',
                    'pages_count': total_pages,
                    'text_preview': full_text[:1000],
                    'note': 'No clean visual tables found. Extracted textual contents into paragraph dataset.'
                })

        # Scanned PDF with neither tables nor text
        raise ValueError(
            "This PDF appears to be a scanned image document with no selectable text or tabular data. "
            "Optical Character Recognition (OCR) is required to parse scanned documents."
        )

    @classmethod
    def _prepare_dataset_payload(cls, df: pd.DataFrame, filename: str, metadata: dict = None) -> dict:
        """Converts DataFrame into unified payload with schema, stats, and records."""
        # Replace NaN / inf values with None for JSON serialization
        df = df.replace([np.inf, -np.inf], np.nan)

        # Inferred schema
        schema = {}
        numeric_cols = []
        categorical_cols = []
        datetime_cols = []

        for col in df.columns:
            series = df[col]
            non_null_count = int(series.notna().sum())
            null_count = int(series.isna().sum())
            unique_count = int(series.nunique(dropna=True))

            # Attempt datetime inference
            is_datetime = False
            if series.dtype == 'object' and unique_count > 0:
                sample_vals = series.dropna().head(10).astype(str)
                if any(any(c in v for c in ['-', '/', ':']) for v in sample_vals):
                    try:
                        pd.to_datetime(sample_vals, errors='raise')
                        is_datetime = True
                    except Exception:
                        is_datetime = False

            if pd.api.types.is_numeric_dtype(series):
                col_type = 'numeric'
                numeric_cols.append(col)
            elif is_datetime or pd.api.types.is_datetime64_any_dtype(series):
                col_type = 'datetime'
                datetime_cols.append(col)
            else:
                # Check if it looks like an ID
                col_name_lower = str(col).lower()
                if ('id' in col_name_lower or 'code' in col_name_lower) and unique_count == len(df):
                    col_type = 'id'
                else:
                    col_type = 'categorical'
                    categorical_cols.append(col)

            schema[col] = {
                'name': col,
                'type': col_type,
                'non_null_count': non_null_count,
                'null_count': null_count,
                'unique_count': unique_count,
                'completeness_pct': round((non_null_count / len(df) * 100), 1) if len(df) > 0 else 100.0
            }

        # Calculations for Overview
        total_rows = len(df)
        total_cols = len(df.columns)
        total_cells = total_rows * total_cols
        missing_cells = int(df.isna().sum().sum())
        missing_pct = round((missing_cells / total_cells * 100), 2) if total_cells > 0 else 0.0
        duplicate_count = int(df.duplicated().sum())
        duplicate_pct = round((duplicate_count / total_rows * 100), 2) if total_rows > 0 else 0.0
        memory_bytes = int(df.memory_usage(deep=True).sum()) if total_rows > 0 else 0
        memory_formatted = cls._format_memory(memory_bytes)

        # Clean records for frontend
        records = df.to_dict(orient='records')
        clean_records = []
        for r in records:
            clean_r = {}
            for k, v in r.items():
                if pd.isna(v):
                    clean_r[k] = None
                elif isinstance(v, (np.integer, int)):
                    clean_r[k] = int(v)
                elif isinstance(v, (np.floating, float)):
                    clean_r[k] = round(float(v), 4)
                elif isinstance(v, (datetime, pd.Timestamp)):
                    clean_r[k] = v.isoformat()
                else:
                    clean_r[k] = v
            clean_records.append(clean_r)

        dataset_id = str(uuid.uuid4())
        return {
            'success': True,
            'dataset_id': dataset_id,
            'dataset_name': os.path.splitext(os.path.basename(filename))[0],
            'filename': os.path.basename(filename),
            'row_count': total_rows,
            'col_count': total_cols,
            'total_cells': total_cells,
            'missing_cells': missing_cells,
            'missing_pct': missing_pct,
            'duplicate_count': duplicate_count,
            'duplicate_pct': duplicate_pct,
            'memory_bytes': memory_bytes,
            'memory_usage': memory_formatted,
            'schema': schema,
            'numeric_cols': numeric_cols,
            'categorical_cols': categorical_cols,
            'datetime_cols': datetime_cols,
            'preview_rows': clean_records[:20],
            'metadata': metadata or {},
            'records': clean_records
        }

    @classmethod
    def compute_full_eda(cls, df: pd.DataFrame) -> dict:
        """Comprehensive EDA statistics, distributions, and correlation matrix."""
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        categorical_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]

        num_stats = {}
        for col in numeric_cols:
            s = df[col].dropna()
            if len(s) == 0:
                continue
            mean = float(s.mean())
            std = float(s.std(ddof=1)) if len(s) > 1 else 0.0
            variance = float(s.var(ddof=1)) if len(s) > 1 else 0.0
            median = float(s.median())
            mode_s = s.mode()
            mode = float(mode_s.iloc[0]) if not mode_s.empty else median
            minimum = float(s.min())
            maximum = float(s.max())
            q1 = float(s.quantile(0.25))
            q3 = float(s.quantile(0.75))
            iqr = q3 - q1
            skewness = float(s.skew()) if len(s) > 2 else 0.0

            # Outlier detection (Tukey IQR)
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            outliers = s[(s < lower_bound) | (s > upper_bound)]
            outlier_count = len(outliers)

            # Histogram bins
            hist_counts, bin_edges = np.histogram(s, bins=min(12, max(5, int(math.sqrt(len(s))))))
            bin_labels = [f"{round(bin_edges[i], 1)} - {round(bin_edges[i+1], 1)}" for i in range(len(hist_counts))]

            num_stats[col] = {
                'count': len(s),
                'mean': round(mean, 2),
                'std': round(std, 2),
                'variance': round(variance, 2),
                'median': round(median, 2),
                'mode': round(mode, 2),
                'min': round(minimum, 2),
                'max': round(maximum, 2),
                'q1': round(q1, 2),
                'q3': round(q3, 2),
                'iqr': round(iqr, 2),
                'skewness': round(skewness, 3),
                'outlier_count': outlier_count,
                'outlier_pct': round((outlier_count / len(s)) * 100, 1),
                'histogram': {
                    'labels': bin_labels,
                    'values': [int(c) for c in hist_counts]
                }
            }

        cat_stats = {}
        for col in categorical_cols:
            s = df[col].fillna('(Missing)').astype(str)
            val_counts = s.value_counts()
            top_entries = []
            for val, count in val_counts.head(10).items():
                top_entries.append({
                    'category': str(val),
                    'count': int(count),
                    'pct': round((count / len(s)) * 100, 1)
                })
            cat_stats[col] = {
                'unique_count': int(s.nunique()),
                'top_category': str(val_counts.index[0]) if not val_counts.empty else 'N/A',
                'top_count': int(val_counts.iloc[0]) if not val_counts.empty else 0,
                'distribution': top_entries
            }

        # Pearson Correlation Matrix
        corr_matrix = {}
        strong_pairs = []
        if len(numeric_cols) >= 2:
            num_df = df[numeric_cols].apply(pd.to_numeric, errors='coerce')
            corr = num_df.corr(method='pearson').fillna(0.0)

            for col in numeric_cols:
                corr_matrix[col] = {}
                for col2 in numeric_cols:
                    corr_matrix[col][col2] = round(float(corr.loc[col, col2]), 3)

            for i, c1 in enumerate(numeric_cols):
                for j, c2 in enumerate(numeric_cols):
                    if i < j:
                        r_val = float(corr.loc[c1, c2])
                        if not math.isnan(r_val):
                            strong_pairs.append({
                                'col1': c1,
                                'col2': c2,
                                'r': round(r_val, 3),
                                'abs_r': abs(round(r_val, 3)),
                                'type': 'Positive' if r_val > 0 else 'Negative'
                            })
            strong_pairs.sort(key=lambda x: x['abs_r'], reverse=True)

        return {
            'numeric_stats': num_stats,
            'categorical_stats': cat_stats,
            'correlation_matrix': corr_matrix,
            'strongest_correlations': strong_pairs[:8]
        }

    @classmethod
    def generate_business_insights(cls, df: pd.DataFrame, eda: dict = None) -> list:
        """Derives plain-English business takeaways with metrics and action items."""
        if eda is None:
            eda = cls.compute_full_eda(df)

        insights = []
        total_rows = len(df)
        null_count = int(df.isna().sum().sum())
        total_cells = total_rows * len(df.columns) if total_rows > 0 else 1
        completeness = round(((total_cells - null_count) / total_cells) * 100, 1)

        # 1. Quality & Integrity
        if null_count == 0:
            insights.append({
                'title': 'Pristine Data Quality (100% Complete)',
                'metric': f'{total_rows} records with 0 missing cells',
                'explanation': 'The ingested dataset exhibits zero data loss and flawless record integrity across all attributes.',
                'business_implication': 'High confidence for machine learning and executive reporting without imputation bias.',
                'next_action': 'Proceed directly with predictive modeling and multivariate correlation exploration.',
                'type': 'success',
                'icon': '🛡️'
            })
        else:
            insights.append({
                'title': 'Data Hygiene Attention Needed',
                'metric': f'{null_count} missing cells ({100 - completeness}% null rate)',
                'explanation': 'Certain features contain unrecorded values which may skew statistical aggregations.',
                'business_implication': 'Incomplete customer or transaction fields could distort segment averages.',
                'next_action': 'Utilize the Data Transformation tab to apply Mean, Median, or Mode imputation.',
                'type': 'warning',
                'icon': '⚠️'
            })

        # 2. Key Driver / Correlation
        strong_pairs = eda.get('strongest_correlations', [])
        if strong_pairs:
            top_pair = strong_pairs[0]
            if top_pair['abs_r'] >= 0.5:
                direction = "direct positive" if top_pair['r'] > 0 else "strong inverse"
                strength = "very strong" if top_pair['abs_r'] >= 0.75 else "moderate-to-strong"
                insights.append({
                    'title': f"Primary Statistical Driver: {top_pair['col1']} ⟷ {top_pair['col2']}",
                    'metric': f"Pearson r = {top_pair['r']}",
                    'explanation': f"A {strength} {direction} dependency exists between '{top_pair['col1']}' and '{top_pair['col2']}'.",
                    'business_implication': f"Strategic interventions altering {top_pair['col1']} will produce measurable downstream impact on {top_pair['col2']}.",
                    'next_action': f"Test a regression predictive model using {top_pair['col1']} as the independent feature.",
                    'type': 'highlight',
                    'icon': '📈'
                })

        # 3. Volatility & Risk Outliers
        num_stats = eda.get('numeric_stats', {})
        high_outlier_col = None
        max_outlier_rate = 0
        for col, stats in num_stats.items():
            if stats['outlier_pct'] > max_outlier_rate and stats['outlier_count'] > 0:
                max_outlier_rate = stats['outlier_pct']
                high_outlier_col = col

        if high_outlier_col and max_outlier_rate > 3.0:
            st = num_stats[high_outlier_col]
            insights.append({
                'title': f"Notable Outlier Concentration in '{high_outlier_col}'",
                'metric': f"{st['outlier_count']} anomalous rows ({st['outlier_pct']}%)",
                'explanation': f"Values in '{high_outlier_col}' exceed 1.5x IQR boundary [Min: {st['min']}, Max: {st['max']}, Median: {st['median']}].",
                'business_implication': 'Extreme values indicate VIP transactions, server spikes, or measurement anomalies.',
                'next_action': f"Examine outliers in the Anomaly Scanner to assess if they reflect genuine high performers or data errors.",
                'type': 'info',
                'icon': '🚨'
            })

        # 4. Dominant Category Distribution
        cat_stats = eda.get('categorical_stats', {})
        for col, c_info in cat_stats.items():
            if c_info['distribution']:
                top = c_info['distribution'][0]
                if top['pct'] >= 40.0:
                    insights.append({
                        'title': f"Dominant Segment in '{col}': {top['category']}",
                        'metric': f"{top['pct']}% of dataset ({top['count']} occurrences)",
                        'explanation': f"The category '{top['category']}' represents the single largest operational segment.",
                        'business_implication': 'Concentration in one category creates both core revenue dependency and expansion opportunities.',
                        'next_action': f"Benchmark secondary segments against {top['category']} in Visual Studio to discover untapped growth.",
                        'type': 'highlight',
                        'icon': '🎯'
                    })
                    break

        return insights

    @classmethod
    def execute_nl_query(cls, query: str, df: pd.DataFrame) -> dict:
        """
        Interprets natural-language business commands, maps to real columns dynamically,
        and computes deterministic analytical results.
        """
        q_raw = query.strip()
        q = q_raw.lower()

        if df is None or len(df) == 0:
            return {
                'success': False,
                'status': 'error',
                'summary': 'No active dataset is loaded. Please upload or load a dataset first.',
                'explanation': 'NeuroData AI needs an active dataset to perform calculations.'
            }

        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        categorical_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
        all_cols = list(df.columns)

        def find_best_column(keywords, col_pool):
            """Finds matching column by exact or substring match."""
            for kw in keywords:
                for col in col_pool:
                    if kw in col.lower():
                        return col
            return None

        # Helper mapping dictionaries for semantic business terms
        product_col = find_best_column(['product', 'item', 'name', 'title', 'sku', 'service', 'device', 'brand'], categorical_cols or all_cols)
        category_col = find_best_column(['category', 'tier', 'type', 'status', 'mode', 'segment', 'genre', 'class'], categorical_cols or all_cols)
        region_col = find_best_column(['region', 'country', 'city', 'location', 'state', 'territory', 'zone', 'area'], categorical_cols or all_cols)
        date_col = find_best_column(['date', 'time', 'timestamp', 'month', 'year', 'day', 'seq'], all_cols)
        customer_col = find_best_column(['customer', 'student', 'user', 'client', 'patient', 'id'], all_cols)

        revenue_col = find_best_column(['revenue', 'sales', 'turnover', 'income', 'spend', 'price', 'amount', 'total', 'cost'], numeric_cols)
        quantity_col = find_best_column(['quantity', 'qty', 'units', 'orders', 'count', 'volume', 'headcount', 'score', 'hours'], numeric_cols)
        age_col = find_best_column(['age', 'years'], numeric_cols)

        # -------------------------------------------------------------------
        # INTENT 1: Complete EDA / Dataset Overview
        # -------------------------------------------------------------------
        if any(k in q for k in ['analyze', 'summary', 'overview', 'describe', 'eda', 'profile', 'inspect']):
            eda = cls.compute_full_eda(df)
            insights = cls.generate_business_insights(df, eda)
            num_c_count = len(numeric_cols)
            cat_c_count = len(categorical_cols)

            return {
                'success': True,
                'intent': 'eda_summary',
                'query': q_raw,
                'summary': f"Dataset contains {len(df)} rows across {len(all_cols)} attributes ({num_c_count} numeric, {cat_c_count} categorical).",
                'explanation': f"Automated exploratory analysis identified {len(insights)} key business takeaways and complete statistical distributions.",
                'evidence_data': [{
                    'Metric': 'Total Rows', 'Value': len(df)
                }, {
                    'Metric': 'Features', 'Value': len(all_cols)
                }, {
                    'Metric': 'Numeric Features', 'Value': num_c_count
                }, {
                    'Metric': 'Categorical Features', 'Value': cat_c_count
                }, {
                    'Metric': 'Missing Cells', 'Value': int(df.isna().sum().sum())
                }, {
                    'Metric': 'Duplicate Rows', 'Value': int(df.duplicated().sum())
                }],
                'next_suggestions': [
                    "Show the top 10 products by revenue",
                    "Find correlations between numerical columns",
                    "Show unusual values and outliers",
                    "Predict future trends"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 2: Top Products / Most Purchased / Best Selling
        # -------------------------------------------------------------------
        if any(k in q for k in ['most purchased', 'sells the most', 'best selling', 'top product', 'top 10 product', 'top 5 product', 'most popular product']):
            group_col = product_col or category_col or (categorical_cols[0] if categorical_cols else None)
            if not group_col:
                return {
                    'success': False,
                    'summary': "Could not identify a suitable product or categorical dimension in this dataset.",
                    'explanation': f"Available columns are: {', '.join(all_cols)}"
                }

            # Determine metric: Revenue vs Quantity vs Frequency
            is_revenue_req = any(k in q for k in ['revenue', 'dollar', 'sales', 'turnover', 'money'])
            is_quantity_req = any(k in q for k in ['quantity', 'units', 'volume', 'purchased', 'sells'])

            target_metric_col = None
            agg_method = 'sum'
            metric_label = 'Count'

            if is_revenue_req and revenue_col:
                target_metric_col = revenue_col
                metric_label = f"Total {revenue_col}"
            elif is_quantity_req and quantity_col:
                target_metric_col = quantity_col
                metric_label = f"Total {quantity_col}"
            elif revenue_col:
                target_metric_col = revenue_col
                metric_label = f"Total {revenue_col}"
            elif quantity_col:
                target_metric_col = quantity_col
                metric_label = f"Total {quantity_col}"

            if target_metric_col:
                grouped = df.groupby(group_col)[target_metric_col].sum().reset_index()
                grouped = grouped.sort_values(by=target_metric_col, ascending=False)
            else:
                grouped = df[group_col].value_counts().reset_index()
                grouped.columns = [group_col, 'Frequency']
                target_metric_col = 'Frequency'
                metric_label = 'Order Frequency'

            top_n = 10 if '10' in q else (5 if '5' in q else 10)
            top_records = grouped.head(top_n)
            champion = top_records.iloc[0]
            champ_name = champion[group_col]
            champ_val = champion[target_metric_col]

            chart_labels = top_records[group_col].astype(str).tolist()
            chart_values = [round(float(v), 2) for v in top_records[target_metric_col].tolist()]

            return {
                'success': True,
                'intent': 'top_entity',
                'query': q_raw,
                'summary': f"The leading {group_col} is '{champ_name}' with {metric_label} of {champ_val:,.2f}.",
                'explanation': f"Evaluated all records aggregated by '{group_col}' against metric '{target_metric_col}'. Ranked top {len(top_records)} entries.",
                'evidence_data': top_records.to_dict(orient='records'),
                'chart_config': {
                    'type': 'bar',
                    'title': f"Top {len(top_records)} {group_col} by {metric_label}",
                    'labels': chart_labels,
                    'datasets': [{
                        'label': metric_label,
                        'data': chart_values,
                        'color': '#06b6d4'
                    }]
                },
                'next_suggestions': [
                    f"Compare sales across different {region_col or 'categories'}",
                    f"Show monthly sales trends for {champ_name}",
                    "Find unusual values and outliers"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 3: Best Selling Category / Segment
        # -------------------------------------------------------------------
        if any(k in q for k in ['category', 'segment', 'tier']) and any(k in q for k in ['best', 'top', 'most', 'highest', 'compare', 'share']):
            target_cat = category_col or product_col or (categorical_cols[0] if categorical_cols else None)
            if not target_cat:
                return {
                    'success': False,
                    'summary': "No categorical column found to group categories.",
                    'explanation': f"Available columns are: {', '.join(all_cols)}"
                }

            metric = revenue_col or quantity_col
            if metric:
                grouped = df.groupby(target_cat)[metric].sum().reset_index().sort_values(by=metric, ascending=False)
                metric_name = f"Total {metric}"
            else:
                grouped = df[target_cat].value_counts().reset_index()
                grouped.columns = [target_cat, 'Record_Count']
                metric = 'Record_Count'
                metric_name = 'Record Count'

            top_cat = grouped.iloc[0]
            chart_labels = grouped[target_cat].astype(str).tolist()
            chart_values = [round(float(v), 2) for v in grouped[metric].tolist()]

            return {
                'success': True,
                'intent': 'category_analysis',
                'query': q_raw,
                'summary': f"Leading {target_cat} is '{top_cat[target_cat]}' with {metric_name} of {top_cat[metric]:,.2f}.",
                'explanation': f"Grouped {len(df)} records across '{target_cat}' and calculated {metric_name}.",
                'evidence_data': grouped.to_dict(orient='records'),
                'chart_config': {
                    'type': 'doughnut' if len(chart_labels) <= 6 else 'bar',
                    'title': f"{metric_name} Distribution by {target_cat}",
                    'labels': chart_labels,
                    'datasets': [{
                        'label': metric_name,
                        'data': chart_values
                    }]
                },
                'next_suggestions': [
                    "Calculate total sales and average order value",
                    "Compare sales across different regions",
                    "Generate an executive report"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 4: Total Sales & Average Order Value (AOV)
        # -------------------------------------------------------------------
        if any(k in q for k in ['total sales', 'total revenue', 'average order value', 'aov', 'calculate total']):
            metric_target = revenue_col or (numeric_cols[0] if numeric_cols else None)
            if not metric_target:
                return {
                    'success': False,
                    'summary': "No numeric sales or financial column found.",
                    'explanation': f"Available numeric columns: {', '.join(numeric_cols)}"
                }

            s = df[metric_target].dropna()
            total_sum = float(s.sum())
            mean_val = float(s.mean())
            median_val = float(s.median())

            return {
                'success': True,
                'intent': 'aggregate_metrics',
                'query': q_raw,
                'summary': f"Total {metric_target}: ${total_sum:,.2f} | Average (AOV): ${mean_val:,.2f} | Median: ${median_val:,.2f}.",
                'explanation': f"Computed full aggregations across {len(s)} non-null entries for '{metric_target}'.",
                'evidence_data': [
                    {'Metric': f"Total {metric_target}", 'Value': f"${total_sum:,.2f}"},
                    {'Metric': f"Average (AOV)", 'Value': f"${mean_val:,.2f}"},
                    {'Metric': f"Median Value", 'Value': f"${median_val:,.2f}"},
                    {'Metric': f"Minimum", 'Value': f"${float(s.min()):,.2f}"},
                    {'Metric': f"Maximum", 'Value': f"${float(s.max()):,.2f}"}
                ],
                'next_suggestions': [
                    "Show monthly sales trends",
                    "Show unusual values and outliers",
                    "Predict next month's sales"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 5: Time Series / Monthly Sales Trends
        # -------------------------------------------------------------------
        if any(k in q for k in ['monthly', 'trend', 'time series', 'over time', 'timeline', 'chronological']):
            time_dim = date_col or (all_cols[0] if all_cols else None)
            metric_dim = revenue_col or quantity_col or (numeric_cols[0] if numeric_cols else None)

            if not time_dim or not metric_dim:
                return {
                    'success': False,
                    'summary': "Dataset lacks suitable time or numeric metric columns for temporal trends.",
                    'explanation': f"Identified time column: {time_dim}, numeric metric: {metric_dim}"
                }

            # Attempt time sorting & grouping
            df_temp = df[[time_dim, metric_dim]].dropna().copy()
            try:
                df_temp['parsed_dt'] = pd.to_datetime(df_temp[time_dim], errors='coerce')
                if df_temp['parsed_dt'].notna().sum() > len(df_temp) * 0.5:
                    df_temp = df_temp.sort_values(by='parsed_dt')
                    df_temp['period'] = df_temp['parsed_dt'].dt.strftime('%Y-%m')
                    grouped = df_temp.groupby('period')[metric_dim].sum().reset_index()
                else:
                    grouped = df_temp.head(25)
            except Exception:
                grouped = df_temp.head(25)

            chart_labels = grouped.iloc[:, 0].astype(str).tolist()
            chart_values = [round(float(v), 2) for v in grouped[metric_dim].tolist()]

            return {
                'success': True,
                'intent': 'time_trends',
                'query': q_raw,
                'summary': f"Time-series trend for {metric_dim} plotted across {len(grouped)} periods.",
                'explanation': f"Aggregated '{metric_dim}' chronologically along '{time_dim}'.",
                'evidence_data': grouped.to_dict(orient='records'),
                'chart_config': {
                    'type': 'line',
                    'title': f"{metric_dim} Temporal Trajectory",
                    'labels': chart_labels,
                    'datasets': [{
                        'label': metric_dim,
                        'data': chart_values,
                        'color': '#10b981'
                    }]
                },
                'next_suggestions': [
                    "Predict next month's sales",
                    "Show unusual values and outliers",
                    "Export my analysis as a PDF"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 6: Regional Comparison
        # -------------------------------------------------------------------
        if any(k in q for k in ['region', 'country', 'city', 'geographic', 'location']):
            target_reg = region_col or (categorical_cols[0] if categorical_cols else None)
            metric_dim = revenue_col or quantity_col or (numeric_cols[0] if numeric_cols else None)

            if not target_reg or not metric_dim:
                return {
                    'success': False,
                    'summary': "Dataset does not contain identifiable geographic region columns.",
                    'explanation': f"Available categorical dimensions: {', '.join(categorical_cols)}"
                }

            grouped = df.groupby(target_reg)[metric_dim].sum().reset_index().sort_values(by=metric_dim, ascending=False)
            top_region = grouped.iloc[0]

            return {
                'success': True,
                'intent': 'regional_comparison',
                'query': q_raw,
                'summary': f"Top region is '{top_region[target_reg]}' with total {metric_dim} of {top_region[metric_dim]:,.2f}.",
                'explanation': f"Computed regional distribution of '{metric_dim}' across {len(grouped)} territories.",
                'evidence_data': grouped.to_dict(orient='records'),
                'chart_config': {
                    'type': 'bar',
                    'title': f"{metric_dim} by {target_reg}",
                    'labels': grouped[target_reg].astype(str).tolist(),
                    'datasets': [{
                        'label': f"Total {metric_dim}",
                        'data': [round(float(v), 2) for v in grouped[metric_dim].tolist()],
                        'color': '#8b5cf6'
                    }]
                },
                'next_suggestions': [
                    "Show the top 10 products by revenue",
                    "Calculate total sales and average order value",
                    "Generate an executive report"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 7: Missing Values Inspection
        # -------------------------------------------------------------------
        if any(k in q for k in ['missing value', 'null', 'na', 'missing cells', 'incomplete']):
            missing_report = []
            for col in all_cols:
                null_c = int(df[col].isna().sum())
                if null_c > 0:
                    missing_report.append({
                        'Column': col,
                        'Missing_Count': null_c,
                        'Missing_Pct': round((null_c / len(df)) * 100, 2),
                        'Data_Type': str(df[col].dtype)
                    })

            if not missing_report:
                return {
                    'success': True,
                    'intent': 'missing_values',
                    'query': q_raw,
                    'summary': "Great news! No missing values detected in any of the columns (100% data completeness).",
                    'explanation': f"Scanned all {len(df)} rows across {len(all_cols)} attributes.",
                    'evidence_data': [{'Status': 'Clean', 'Message': '0 missing values found'}]
                }

            missing_report.sort(key=lambda x: x['Missing_Count'], reverse=True)
            return {
                'success': True,
                'intent': 'missing_values',
                'query': q_raw,
                'summary': f"Found missing values in {len(missing_report)} column(s). Most affected: '{missing_report[0]['Column']}' ({missing_report[0]['Missing_Count']} nulls).",
                'explanation': "Review the breakdown below. Imputation or record filtering is recommended before building predictive models.",
                'evidence_data': missing_report,
                'next_suggestions': [
                    "Remove duplicate rows",
                    "Analyze my dataset",
                    "Find unusual values and outliers"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 8: Remove Duplicate Rows
        # -------------------------------------------------------------------
        if any(k in q for k in ['remove duplicate', 'deduplicate', 'drop duplicate']):
            initial_count = len(df)
            dup_count = int(df.duplicated().sum())

            return {
                'success': True,
                'intent': 'deduplicate',
                'query': q_raw,
                'summary': f"Identified {dup_count} duplicate row(s) out of {initial_count} total records.",
                'explanation': f"Triggering automated deduplication preserves {initial_count - dup_count} unique records. You can apply this in the Data Transformation tab.",
                'evidence_data': [
                    {'Metric': 'Initial Records', 'Value': initial_count},
                    {'Metric': 'Duplicate Records', 'Value': dup_count},
                    {'Metric': 'Resulting Unique Records', 'Value': initial_count - dup_count}
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 9: Outliers and Anomalies
        # -------------------------------------------------------------------
        if any(k in q for k in ['outlier', 'unusual value', 'anomaly', 'extreme']):
            if not numeric_cols:
                return {
                    'success': False,
                    'summary': "No numerical columns available for outlier detection.",
                    'explanation': "Outlier analysis requires continuous numerical features."
                }

            target_num = revenue_col or numeric_cols[0]
            s = df[target_num].dropna()
            q1 = float(s.quantile(0.25))
            q3 = float(s.quantile(0.75))
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr

            outlier_mask = (df[target_num] < lower) | (df[target_num] > upper)
            outlier_rows = df[outlier_mask].head(10)
            outlier_count = int(outlier_mask.sum())

            return {
                'success': True,
                'intent': 'outlier_detection',
                'query': q_raw,
                'summary': f"Detected {outlier_count} statistical outlier(s) in '{target_num}' (Bounds: {lower:.2f} to {upper:.2f}).",
                'explanation': f"Applied Tukey's 1.5x IQR method on feature '{target_num}'. {outlier_count} observations fall outside normal bounds.",
                'evidence_data': outlier_rows.to_dict(orient='records'),
                'next_suggestions': [
                    "Find correlations between numerical columns",
                    "Plot a histogram of customer ages",
                    "Predict next month's sales"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 10: Correlation Analysis
        # -------------------------------------------------------------------
        if any(k in q for k in ['correlation', 'relationship', 'dependency', 'pearson']):
            if len(numeric_cols) < 2:
                return {
                    'success': False,
                    'summary': "Need at least 2 numerical columns to compute correlations.",
                    'explanation': f"Found numeric columns: {', '.join(numeric_cols)}"
                }

            eda = cls.compute_full_eda(df)
            strong_pairs = eda.get('strongest_correlations', [])
            if not strong_pairs:
                return {
                    'success': True,
                    'summary': "No significant correlations found among numerical columns.",
                    'explanation': "Features appear to be statistically independent."
                }

            top_pair = strong_pairs[0]
            return {
                'success': True,
                'intent': 'correlation',
                'query': q_raw,
                'summary': f"Strongest relationship: '{top_pair['col1']}' and '{top_pair['col2']}' (r = {top_pair['r']}).",
                'explanation': f"Computed full Pearson correlation matrix across {len(numeric_cols)} numeric attributes. Top pairs ranked below.",
                'evidence_data': strong_pairs[:6],
                'next_suggestions': [
                    f"Create a scatter plot of {top_pair['col1']} vs {top_pair['col2']}",
                    f"Fit a regression model for {top_pair['col2']}",
                    "Generate an executive report"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 11: Plot / Chart Generation (Histogram / Bar / Scatter)
        # -------------------------------------------------------------------
        if any(k in q for k in ['plot', 'chart', 'histogram', 'scatter', 'bar chart']):
            if 'histogram' in q:
                target_col = age_col or (numeric_cols[0] if numeric_cols else None)
                if target_col:
                    s = df[target_col].dropna()
                    counts, edges = np.histogram(s, bins=8)
                    labels = [f"{round(edges[i], 1)}-{round(edges[i+1], 1)}" for i in range(len(counts))]
                    return {
                        'success': True,
                        'intent': 'chart_generation',
                        'query': q_raw,
                        'summary': f"Generated distribution histogram for '{target_col}'.",
                        'explanation': f"Discretized continuous values into 8 balanced bins.",
                        'chart_config': {
                            'type': 'bar',
                            'title': f"Distribution Histogram: {target_col}",
                            'labels': labels,
                            'datasets': [{'label': 'Frequency', 'data': [int(c) for c in counts], 'color': '#06b6d4'}]
                        }
                    }

            if 'bar' in q or 'revenue by product' in q:
                g_col = product_col or category_col or (categorical_cols[0] if categorical_cols else None)
                m_col = revenue_col or quantity_col or (numeric_cols[0] if numeric_cols else None)
                if g_col and m_col:
                    grp = df.groupby(g_col)[m_col].sum().reset_index().sort_values(by=m_col, ascending=False).head(10)
                    return {
                        'success': True,
                        'intent': 'chart_generation',
                        'query': q_raw,
                        'summary': f"Created bar chart of '{m_col}' grouped by '{g_col}'.",
                        'explanation': f"Aggregated {m_col} across top {len(grp)} {g_col} entities.",
                        'chart_config': {
                            'type': 'bar',
                            'title': f"{m_col} by {g_col}",
                            'labels': grp[g_col].astype(str).tolist(),
                            'datasets': [{'label': m_col, 'data': [round(float(v), 2) for v in grp[m_col].tolist()], 'color': '#3b82f6'}]
                        }
                    }

        # -------------------------------------------------------------------
        # INTENT 12: Predictive Forecasting & Modeling
        # -------------------------------------------------------------------
        if any(k in q for k in ['predict', 'forecast', 'future demand', 'churn']):
            target = revenue_col or quantity_col or (numeric_cols[-1] if numeric_cols else None)
            if not target:
                return {
                    'success': False,
                    'summary': "Cannot predict: No suitable numerical target feature found.",
                    'explanation': "Predictive modeling requires a numerical metric or behavioral target."
                }

            pred_res = cls.train_forecast(df, target, horizon=10)
            return {
                'success': True,
                'intent': 'prediction',
                'query': q_raw,
                'summary': f"Forecasted next 10 periods for '{target}'. Projected mean: {pred_res['projected_mean']:,.2f} (Model RMSE: {pred_res['rmse']:,.2f}).",
                'explanation': "Utilized Holt's linear trend smoothing with exponential weighting on historical series.",
                'evidence_data': pred_res['projections'],
                'chart_config': {
                    'type': 'line',
                    'title': f"10-Step Forward Projection: {target}",
                    'labels': [p['Period'] for p in pred_res['projections']],
                    'datasets': [{
                        'label': f"Projected {target}",
                        'data': [p['Projected_Value'] for p in pred_res['projections']],
                        'color': '#ec4899'
                    }]
                },
                'next_suggestions': [
                    "Generate an executive report",
                    "Export my analysis as a PDF"
                ]
            }

        # -------------------------------------------------------------------
        # INTENT 13: Report & Export
        # -------------------------------------------------------------------
        if any(k in q for k in ['report', 'dossier', 'export', 'pdf']):
            return {
                'success': True,
                'intent': 'action_report',
                'query': q_raw,
                'summary': "Executive Dossier report is ready for generation and PDF export.",
                'explanation': "You can switch to the 'Executive Dossier' section or click 'Export PDF' in the header.",
                'action': 'navigate_tab',
                'tab_id': 'report-view'
            }

        # Fallback interpretation: Group by first categorical column or calculate stats
        first_cat = categorical_cols[0] if categorical_cols else None
        first_num = numeric_cols[0] if numeric_cols else None

        if first_cat and first_num:
            grp = df.groupby(first_cat)[first_num].mean().reset_index().head(8)
            return {
                'success': True,
                'intent': 'general_analysis',
                'query': q_raw,
                'summary': f"Interpreted query against '{first_cat}' and '{first_num}'.",
                'explanation': f"Calculated mean {first_num} by {first_cat} as the most relevant operation.",
                'evidence_data': grp.to_dict(orient='records'),
                'next_suggestions': [
                    "Analyze my dataset",
                    "Show the top 10 products by revenue",
                    "Calculate total sales and average order value"
                ]
            }

        return {
            'success': False,
            'summary': f"I received your request: '{q_raw}', but could not find a direct mapping to dataset columns.",
            'explanation': f"Try asking: 'Show the most purchased product', 'Calculate total sales', or 'Analyze my dataset'.",
            'next_suggestions': [
                "Analyze my dataset",
                "Show the top 10 products by revenue",
                "Find the columns with missing values"
            ]
        }

    @classmethod
    def train_forecast(cls, df: pd.DataFrame, feature: str, horizon: int = 10) -> dict:
        """Holt's Linear Exponential Smoothing forecasting."""
        series = df[feature].dropna().astype(float).tolist()
        n = len(series)
        if n < 3:
            raise ValueError("Need at least 3 historical data points for forecasting.")

        alpha = 0.35
        beta = 0.15

        level = series[0]
        trend = series[1] - series[0]

        fitted = [level + trend]
        for t in range(1, n):
            val = series[t]
            last_level = level
            level = alpha * val + (1 - alpha) * (last_level + trend)
            trend = beta * (level - last_level) + (1 - beta) * trend
            fitted.append(level + trend)

        # Forecast forward
        projections = []
        for h in range(1, horizon + 1):
            pred_val = round(level + (h * trend), 2)
            projections.append({
                'Period': f"+{h} Step",
                'Projected_Value': max(0.0, pred_val)
            })

        residuals = [series[i] - fitted[i] for i in range(len(series))]
        mse = sum(r * r for r in residuals) / len(residuals)
        rmse = round(math.sqrt(mse), 2)
        mae = round(sum(abs(r) for r in residuals) / len(residuals), 2)

        proj_vals = [p['Projected_Value'] for p in projections]
        projected_mean = round(sum(proj_vals) / len(proj_vals), 2)

        return {
            'feature': feature,
            'horizon': horizon,
            'rmse': rmse,
            'mae': mae,
            'projected_mean': projected_mean,
            'projections': projections
        }

    @classmethod
    def train_regression(cls, df: pd.DataFrame, feat_x: str, target_y: str, degree: int = 1) -> dict:
        """Linear or Polynomial Regression with R2, RMSE, MSE, MAE metrics."""
        clean_df = df[[feat_x, target_y]].dropna().astype(float)
        if len(clean_df) < 3:
            raise ValueError("Insufficient non-null rows for regression modeling.")

        X = clean_df[[feat_x]].values
        y = clean_df[target_y].values

        if degree == 1:
            if HAS_SKLEARN:
                model = LinearRegression()
                model.fit(X, y)
                preds = model.predict(X)
                slope = float(model.coef_[0])
                intercept = float(model.intercept_)
            else:
                # OLS formula
                x_mean = np.mean(X)
                y_mean = np.mean(y)
                slope = np.sum((X.ravel() - x_mean) * (y - y_mean)) / np.sum((X.ravel() - x_mean)**2)
                intercept = y_mean - slope * x_mean
                preds = slope * X.ravel() + intercept

            r2 = float(r2_score(y, preds)) if HAS_SKLEARN else 1.0 - (np.sum((y - preds)**2) / np.sum((y - np.mean(y))**2))
            mse = float(mean_squared_error(y, preds)) if HAS_SKLEARN else float(np.mean((y - preds)**2))
            rmse = round(math.sqrt(mse), 3)
            mae = float(mean_absolute_error(y, preds)) if HAS_SKLEARN else float(np.mean(np.abs(y - preds)))

            equation = f"y = {slope:.3f}x + {intercept:.3f}"
            min_x = float(np.min(X))
            max_x = float(np.max(X))

            return {
                'model_type': 'linear',
                'degree': 1,
                'feat_x': feat_x,
                'target_y': target_y,
                'equation': equation,
                'r2': round(max(0.0, r2), 4),
                'rmse': rmse,
                'mse': round(mse, 3),
                'mae': round(mae, 3),
                'slope': round(slope, 4),
                'intercept': round(intercept, 4),
                'trendline': [
                    {'x': min_x, 'y': round(slope * min_x + intercept, 2)},
                    {'x': max_x, 'y': round(slope * max_x + intercept, 2)}
                ]
            }
        else:
            # Degree 2 polynomial
            coeffs = np.polyfit(X.ravel(), y, deg=2)
            p = np.poly1d(coeffs)
            preds = p(X.ravel())
            mse = float(np.mean((y - preds)**2))
            rmse = round(math.sqrt(mse), 3)
            ss_tot = np.sum((y - np.mean(y))**2)
            r2 = round(max(0.0, 1.0 - (np.sum((y - preds)**2) / ss_tot)), 4) if ss_tot > 0 else 1.0

            x_sorted = np.linspace(float(np.min(X)), float(np.max(X)), 30)
            trendline = [{'x': round(val, 2), 'y': round(float(p(val)), 2)} for val in x_sorted]

            return {
                'model_type': 'polynomial',
                'degree': 2,
                'feat_x': feat_x,
                'target_y': target_y,
                'equation': f"y = {coeffs[0]:.4f}x² + {coeffs[1]:.3f}x + {coeffs[2]:.2f}",
                'r2': r2,
                'rmse': rmse,
                'mse': round(mse, 3),
                'mae': round(float(np.mean(np.abs(y - preds))), 3),
                'trendline': trendline
            }

    @classmethod
    def generate_pdf_dossier(cls, dataset_name: str, df: pd.DataFrame) -> bytes:
        """Generates an Executive Dossier PDF report with ReportLab."""
        if not HAS_REPORTLAB:
            raise RuntimeError("ReportLab is not installed.")

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'DocTitle',
            parent=styles['Heading1'],
            fontSize=22,
            leading=26,
            textColor=colors.HexColor('#0f172a')
        )
        subtitle_style = ParagraphStyle(
            'DocSub',
            parent=styles['Normal'],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor('#64748b')
        )
        h2_style = ParagraphStyle(
            'SectionH2',
            parent=styles['Heading2'],
            fontSize=13,
            leading=17,
            textColor=colors.HexColor('#0f172a'),
            spaceBefore=14,
            spaceAfter=6
        )
        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontSize=9,
            leading=13,
            textColor=colors.HexColor('#334155')
        )

        elements = []
        # Header
        elements.append(Paragraph("NeuroData AI — Executive Analytics Dossier", title_style))
        elements.append(Paragraph(f"Dataset: <b>{dataset_name}</b> | Generated: {datetime.now().strftime('%B %d, %Y - %H:%M UTC')}", subtitle_style))
        elements.append(Spacer(1, 14))

        # Overview Table
        eda = cls.compute_full_eda(df)
        total_rows = len(df)
        total_cols = len(df.columns)
        null_count = int(df.isna().sum().sum())
        dup_count = int(df.duplicated().sum())

        kpi_data = [
            ["Total Observations", "Total Features", "Missing Cells", "Duplicate Rows", "Data Completeness"],
            [str(total_rows), str(total_cols), str(null_count), str(dup_count), f"{round(((total_rows*total_cols - null_count)/(total_rows*total_cols))*100, 1)}%"]
        ]
        kpi_table = Table(kpi_data, colWidths=[108]*5)
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#f8fafc')),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1'))
        ]))
        elements.append(kpi_table)
        elements.append(Spacer(1, 14))

        # Insights Section
        insights = cls.generate_business_insights(df, eda)
        elements.append(Paragraph("Executive Business Insights & Strategic Takeaways", h2_style))
        for ins in insights:
            ins_text = f"<b>{ins['title']}</b> ({ins['metric']})<br/>{ins['explanation']}<br/><i>Implication:</i> {ins['business_implication']}<br/><i>Recommended Action:</i> {ins['next_action']}"
            elements.append(Paragraph(ins_text, body_style))
            elements.append(Spacer(1, 6))

        # Statistical Summary Table
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("Numerical Feature Statistical Profiles", h2_style))
        num_stats = eda.get('numeric_stats', {})
        if num_stats:
            stat_headers = ["Feature", "Mean", "Median", "Std Dev", "Min", "Max", "IQR", "Skewness", "Outliers"]
            stat_rows = [stat_headers]
            for col, s in list(num_stats.items())[:12]:
                stat_rows.append([
                    col[:16],
                    str(s['mean']),
                    str(s['median']),
                    str(s['std']),
                    str(s['min']),
                    str(s['max']),
                    str(s['iqr']),
                    str(s['skewness']),
                    f"{s['outlier_count']} ({s['outlier_pct']}%)"
                ])
            st_table = Table(stat_rows, colWidths=[90, 50, 50, 55, 50, 50, 50, 60, 85])
            st_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e293b')),
                ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ('TOPPADDING', (0,0), (-1,-1), 5),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0'))
            ]))
            elements.append(st_table)

        # Methodology & Limitations Footer
        elements.append(Spacer(1, 16))
        elements.append(Paragraph("Methodology & Governance Notice", h2_style))
        notice = (
            "This report is generated deterministically by the NeuroData AI engine. "
            "Descriptive statistics use sample unbiased estimators (Bessel's correction for variance and standard deviation). "
            "Outliers are bounded via Tukey's Interquartile Range (IQR 1.5x factor). "
            "Predictive forecasts and regressions represent statistical estimations and should be verified against domain constraints."
        )
        elements.append(Paragraph(notice, body_style))

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    @classmethod
    def compute_comprehensive_analysis(cls, df: pd.DataFrame) -> dict:
        """Full automated analytics engine: overview, numerical stats (with kurtosis),
        categorical stats (with rare categories), data quality analysis, and real AI insights."""
        total_rows = len(df)
        total_cols = len(df.columns)
        total_cells = total_rows * total_cols
        missing_cells = int(df.isna().sum().sum())
        missing_pct = round((missing_cells / total_cells * 100), 2) if total_cells > 0 else 0.0
        dup_count = int(df.duplicated().sum())
        dup_pct = round((dup_count / total_rows * 100), 2) if total_rows > 0 else 0.0
        memory_bytes = int(df.memory_usage(deep=True).sum()) if total_rows > 0 else 0

        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        categorical_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]

        # 1. Dataset Overview
        overview = {
            'total_rows': total_rows,
            'total_columns': total_cols,
            'total_cells': total_cells,
            'missing_values': missing_cells,
            'missing_pct': missing_pct,
            'duplicate_rows': dup_count,
            'duplicate_pct': dup_pct,
            'numerical_columns_count': len(numeric_cols),
            'categorical_columns_count': len(categorical_cols),
            'memory_usage_bytes': memory_bytes,
            'memory_usage': cls._format_memory(memory_bytes)
        }

        # 2. Numerical Statistical Analysis
        num_stats = {}
        for col in numeric_cols:
            s = pd.to_numeric(df[col], errors='coerce').dropna()
            if len(s) == 0:
                continue
            mean_val = float(s.mean())
            std_val = float(s.std(ddof=1)) if len(s) > 1 else 0.0
            var_val = float(s.var(ddof=1)) if len(s) > 1 else 0.0
            median_val = float(s.median())
            mode_s = s.mode()
            mode_val = float(mode_s.iloc[0]) if not mode_s.empty else median_val
            min_val = float(s.min())
            max_val = float(s.max())
            range_val = max_val - min_val
            q1_val = float(s.quantile(0.25))
            q3_val = float(s.quantile(0.75))
            iqr_val = q3_val - q1_val
            skew_val = float(s.skew()) if len(s) > 2 else 0.0
            kurt_val = float(s.kurtosis()) if len(s) > 3 else 0.0

            lower_bound = q1_val - 1.5 * iqr_val
            upper_bound = q3_val + 1.5 * iqr_val
            outliers_s = s[(s < lower_bound) | (s > upper_bound)]
            outlier_cnt = len(outliers_s)
            outlier_pct = round((outlier_cnt / len(s)) * 100, 1)

            # Histogram
            bin_count = min(12, max(5, int(math.sqrt(len(s)))))
            hist_counts, bin_edges = np.histogram(s, bins=bin_count)
            hist_labels = [f"{round(bin_edges[i], 1)} - {round(bin_edges[i+1], 1)}" for i in range(len(hist_counts))]

            num_stats[col] = {
                'count': len(s),
                'mean': round(mean_val, 2),
                'median': round(median_val, 2),
                'mode': round(mode_val, 2),
                'std': round(std_val, 2),
                'variance': round(var_val, 2),
                'min': round(min_val, 2),
                'max': round(max_val, 2),
                'range': round(range_val, 2),
                'q1': round(q1_val, 2),
                'q3': round(q3_val, 2),
                'iqr': round(iqr_val, 2),
                'skewness': round(skew_val, 3),
                'kurtosis': round(kurt_val, 3),
                'outlier_count': outlier_cnt,
                'outlier_pct': outlier_pct,
                'lower_bound': round(lower_bound, 2),
                'upper_bound': round(upper_bound, 2),
                'histogram': {
                    'labels': hist_labels,
                    'values': [int(c) for c in hist_counts]
                },
                'box_plot': {
                    'min': round(min_val, 2),
                    'q1': round(q1_val, 2),
                    'median': round(median_val, 2),
                    'q3': round(q3_val, 2),
                    'max': round(max_val, 2),
                    'lower_whisker': round(lower_bound, 2),
                    'upper_whisker': round(upper_bound, 2),
                    'outliers': [round(float(v), 2) for v in outliers_s.head(20).tolist()]
                }
            }

        # 3. Categorical Analysis
        cat_stats = {}
        for col in categorical_cols:
            s = df[col].fillna('(Missing)').astype(str)
            nu = int(s.nunique())
            vc = s.value_counts()
            top_category = str(vc.index[0]) if not vc.empty else 'N/A'
            top_count = int(vc.iloc[0]) if not vc.empty else 0
            top_pct = round((top_count / len(s)) * 100, 1) if len(s) > 0 else 0.0

            dist = []
            for val, cnt in vc.head(10).items():
                dist.append({
                    'category': str(val),
                    'count': int(cnt),
                    'pct': round((cnt / len(s)) * 100, 1)
                })

            rare_threshold = 5.0 if len(s) < 100 else 1.0
            rare_cats = []
            for val, cnt in vc.items():
                p = (cnt / len(s)) * 100
                if p <= rare_threshold:
                    rare_cats.append({
                        'category': str(val),
                        'count': int(cnt),
                        'pct': round(p, 2)
                    })

            cat_stats[col] = {
                'unique_count': nu,
                'most_frequent': top_category,
                'mode_count': top_count,
                'mode_pct': top_pct,
                'distribution': dist,
                'rare_categories': rare_cats[:15],
                'rare_count': len(rare_cats)
            }

        # 4. Data Quality Analysis
        missing_by_col = {}
        for col in df.columns:
            c_null = int(df[col].isna().sum())
            if c_null > 0:
                missing_by_col[col] = {
                    'count': c_null,
                    'pct': round((c_null / total_rows * 100), 1)
                }

        dup_preview_rows = df[df.duplicated(keep=False)].head(10).to_dict(orient='records')
        dup_preview = []
        for r in dup_preview_rows:
            dup_preview.append({k: (None if pd.isna(v) else v) for k, v in r.items()})

        outliers_by_col = {}
        total_outliers = 0
        for col, st in num_stats.items():
            if st['outlier_count'] > 0:
                total_outliers += st['outlier_count']
                outliers_by_col[col] = {
                    'count': st['outlier_count'],
                    'pct': st['outlier_pct'],
                    'bounds': [st['lower_bound'], st['upper_bound']],
                    'samples': st['box_plot']['outliers']
                }

        constant_cols = [c for c in df.columns if df[c].nunique(dropna=False) <= 1]

        high_card_cols = []
        for col in categorical_cols:
            nu = int(df[col].nunique(dropna=True))
            if (total_rows >= 20 and nu / total_rows > 0.6) or nu > 50:
                high_card_cols.append({
                    'column': col,
                    'unique_count': nu,
                    'ratio': round(nu / total_rows, 2)
                })

        inconsistent_types = []
        for col in categorical_cols:
            sample = df[col].dropna().astype(str).head(50)
            if len(sample) > 0:
                num_like = sample.str.replace(r'[\$,%€£\s]', '', regex=True)
                valid_nums = pd.to_numeric(num_like, errors='coerce').notna().sum()
                if valid_nums / len(sample) > 0.7:
                    inconsistent_types.append({
                        'column': col,
                        'issue': 'Contains numeric or currency symbols stored as text',
                        'recommendation': f"Convert '{col}' to numeric data type"
                    })

        potentially_invalid = []
        non_neg_kw = ['price', 'cost', 'quantity', 'qty', 'units', 'age', 'revenue', 'sales', 'order', 'amount']
        for col in numeric_cols:
            if any(k in col.lower() for k in non_neg_kw):
                s_num = pd.to_numeric(df[col], errors='coerce').dropna()
                neg_count = int((s_num < 0).sum())
                if neg_count > 0:
                    potentially_invalid.append({
                        'column': col,
                        'negative_count': neg_count,
                        'issue': f"Contains {neg_count} negative value(s) in a non-negative domain attribute"
                    })

        data_quality = {
            'missing_cells': missing_cells,
            'missing_pct': missing_pct,
            'missing_by_column': missing_by_col,
            'duplicate_count': dup_count,
            'duplicate_pct': dup_pct,
            'duplicate_preview': dup_preview,
            'total_outliers': total_outliers,
            'outliers_by_column': outliers_by_col,
            'constant_columns': constant_cols,
            'high_cardinality_columns': high_card_cols,
            'inconsistent_types': inconsistent_types,
            'potentially_invalid_values': potentially_invalid
        }

        # 5. Real AI-Powered Insights
        insights = []
        if missing_cells > 0:
            top_miss_col = max(missing_by_col, key=lambda c: missing_by_col[c]['count'])
            insights.append({
                'title': f"Missing Data Hygiene Alert ({missing_cells} cells)",
                'metric': f"{missing_pct}% total missingness across dataset",
                'explanation': f"Column '{top_miss_col}' has the highest missing rate ({missing_by_col[top_miss_col]['count']} nulls, {missing_by_col[top_miss_col]['pct']}%).",
                'business_implication': 'Unimputed missing values can distort metrics and break predictive algorithms.',
                'next_action': f"Impute missing values in '{top_miss_col}' using Median (numeric) or Mode in the Data Cleaning Studio.",
                'type': 'warning',
                'icon': '⚠️'
            })
        else:
            insights.append({
                'title': 'High Data Completeness (100%)',
                'metric': '0 missing cells detected',
                'explanation': 'Every row and column in the uploaded dataset is completely recorded.',
                'business_implication': 'Permits high-confidence analytics and machine learning without imputation bias.',
                'next_action': 'Proceed directly with visual exploration and correlation discovery.',
                'type': 'success',
                'icon': '🛡️'
            })

        if dup_count > 0:
            insights.append({
                'title': f"Redundant Duplicate Records ({dup_count} rows)",
                'metric': f"{dup_pct}% of total records are duplicate entries",
                'explanation': f"Identified {dup_count} rows with identical values across features.",
                'business_implication': 'Duplicate records artificially inflate revenue, order counts, and sample size.',
                'next_action': "Use 'Remove Duplicate Rows' in Data Cleaning Studio to preserve unique transactions.",
                'type': 'warning',
                'icon': '📑'
            })

        if total_outliers > 0 and outliers_by_col:
            top_out_col = max(outliers_by_col, key=lambda c: outliers_by_col[c]['count'])
            st = outliers_by_col[top_out_col]
            insights.append({
                'title': f"Anomalous Outliers Detected in '{top_out_col}'",
                'metric': f"{st['count']} records violate 1.5x IQR boundaries",
                'explanation': f"Values in '{top_out_col}' fall outside range [{st['bounds'][0]}, {st['bounds'][1]}].",
                'business_implication': 'Extreme outlier spikes can bias the sample mean and skew regression models.',
                'next_action': f"Review in Outlier Management to cap or remove extreme records in '{top_out_col}'.",
                'type': 'info',
                'icon': '🚨'
            })

        if constant_cols:
            insights.append({
                'title': f"Zero-Variance Constant Feature: {constant_cols[0]}",
                'metric': f"Single unique value across all {total_rows} rows",
                'explanation': f"Column '{constant_cols[0]}' provides no differentiating information across records.",
                'business_implication': 'Carrying invariant columns increases memory footprint and adds no predictive value.',
                'next_action': f"Remove column '{constant_cols[0]}' in Column Management.",
                'type': 'info',
                'icon': '🔍'
            })

        for c, c_info in cat_stats.items():
            if c_info['distribution'] and c_info['mode_pct'] >= 35.0 and total_rows >= 10:
                insights.append({
                    'title': f"Operational Concentration in '{c}': {c_info['most_frequent']}",
                    'metric': f"{c_info['mode_pct']}% of total volume ({c_info['mode_count']} rows)",
                    'explanation': f"The category '{c_info['most_frequent']}' forms the core operational cluster for '{c}'.",
                    'business_implication': 'High concentration indicates a dominant revenue driver or core segment dependency.',
                    'next_action': f"Filter by '{c}' in Visual Studio to compare performance across sub-categories.",
                    'type': 'highlight',
                    'icon': '🎯'
                })
                break

        if len(numeric_cols) >= 2:
            corr_res = cls.compute_correlation_matrix(df, method='pearson')
            if corr_res.get('strongest_correlations'):
                top_p = corr_res['strongest_correlations'][0]
                if top_p['abs_r'] >= 0.4:
                    dir_str = "positive relationship" if top_p['r'] > 0 else "inverse relationship"
                    insights.append({
                        'title': f"Key Statistical Driver: {top_p['col1']} ⟷ {top_p['col2']}",
                        'metric': f"Pearson r = {top_p['r']}",
                        'explanation': f"Observed a strong {dir_str} between '{top_p['col1']}' and '{top_p['col2']}'.",
                        'business_implication': f"Changes in {top_p['col1']} show strong statistical association with {top_p['col2']}.",
                        'next_action': f"Explore the Scatter Plot or fit a Regression Model with {top_p['col1']} as X.",
                        'type': 'highlight',
                        'icon': '📈'
                    })

        return {
            'overview': overview,
            'numerical_stats': num_stats,
            'categorical_stats': cat_stats,
            'data_quality': data_quality,
            'ai_insights': insights
        }

    @classmethod
    def compute_correlation_matrix(cls, df: pd.DataFrame, method: str = 'pearson') -> dict:
        """Computes Pearson or Spearman correlation matrix safely handling constant features and nulls."""
        method = 'spearman' if str(method).lower() == 'spearman' else 'pearson'
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]

        if len(numeric_cols) < 2:
            return {
                'method': method,
                'columns': numeric_cols,
                'matrix': {},
                'strongest_correlations': [],
                'strongest_positive': [],
                'strongest_negative': []
            }

        num_df = df[numeric_cols].apply(pd.to_numeric, errors='coerce')
        corr = num_df.corr(method=method).fillna(0.0)

        matrix = {}
        pairs = []
        for col1 in numeric_cols:
            matrix[col1] = {}
            for col2 in numeric_cols:
                val = float(corr.loc[col1, col2]) if (col1 in corr.index and col2 in corr.columns) else 0.0
                matrix[col1][col2] = round(0.0 if math.isnan(val) else val, 3)

        for i, c1 in enumerate(numeric_cols):
            for j, c2 in enumerate(numeric_cols):
                if i < j:
                    r_val = float(corr.loc[c1, c2]) if (c1 in corr.index and c2 in corr.columns) else 0.0
                    if not math.isnan(r_val):
                        pairs.append({
                            'col1': c1,
                            'col2': c2,
                            'r': round(r_val, 3),
                            'abs_r': abs(round(r_val, 3)),
                            'type': 'Positive' if r_val > 0 else ('Negative' if r_val < 0 else 'Neutral')
                        })

        pairs.sort(key=lambda x: x['abs_r'], reverse=True)
        pos_pairs = [p for p in pairs if p['r'] > 0.1]
        neg_pairs = [p for p in pairs if p['r'] < -0.1]
        pos_pairs.sort(key=lambda x: x['r'], reverse=True)
        neg_pairs.sort(key=lambda x: x['r'])

        return {
            'method': method,
            'columns': numeric_cols,
            'matrix': matrix,
            'strongest_correlations': pairs[:15],
            'strongest_positive': pos_pairs[:8],
            'strongest_negative': neg_pairs[:8]
        }

    @classmethod
    def clean_dataset(cls, df: pd.DataFrame, action: str, params: dict = None) -> tuple:
        """Applies data cleaning and transformation operations to DataFrame.
        Returns: (updated_df, summary_message, rows_affected)"""
        params = params or {}
        df = df.copy()
        action = str(action).lower().strip()
        summary = "No operation performed."
        rows_affected = 0

        if action == 'drop_nulls':
            cols = params.get('columns')
            subset = [c for c in cols if c in df.columns] if (cols and isinstance(cols, list)) else None
            init_len = len(df)
            df = df.dropna(subset=subset)
            rows_affected = init_len - len(df)
            summary = f"Dropped {rows_affected} incomplete row(s)."

        elif action == 'fill_missing':
            strategy = params.get('strategy', 'mean')
            target_col = params.get('column')
            custom_val = params.get('custom_value', '')
            cols_to_fill = [target_col] if (target_col and target_col in df.columns) else [c for c in df.columns if df[c].isna().any()]
            total_filled = 0

            for col in cols_to_fill:
                null_mask = df[col].isna()
                count = int(null_mask.sum())
                if count == 0:
                    continue
                total_filled += count
                if strategy == 'mean':
                    s_num = pd.to_numeric(df[col], errors='coerce')
                    val = round(float(s_num.mean()), 2)
                    df[col] = df[col].fillna(val)
                elif strategy == 'median':
                    s_num = pd.to_numeric(df[col], errors='coerce')
                    val = round(float(s_num.median()), 2)
                    df[col] = df[col].fillna(val)
                elif strategy == 'mode':
                    mode_s = df[col].mode()
                    val = mode_s.iloc[0] if not mode_s.empty else ''
                    df[col] = df[col].fillna(val)
                elif strategy == 'custom':
                    try:
                        val = float(custom_val) if '.' in str(custom_val) else int(custom_val)
                    except (ValueError, TypeError):
                        val = str(custom_val)
                    df[col] = df[col].fillna(val)
                elif strategy == 'ffill':
                    df[col] = df[col].ffill()
                elif strategy == 'bfill':
                    df[col] = df[col].bfill()

            rows_affected = total_filled
            summary = f"Imputed {total_filled} missing cell(s) across {len(cols_to_fill)} column(s) using '{strategy}'."

        elif action == 'drop_duplicates':
            keep = params.get('keep', 'first')
            if keep not in ['first', 'last', False]:
                keep = 'first'
            init_len = len(df)
            df = df.drop_duplicates(keep=keep)
            rows_affected = init_len - len(df)
            summary = f"Removed {rows_affected} duplicate row(s) (kept {keep} occurrence)."

        elif action == 'remove_outliers':
            col = params.get('column')
            cols = [col] if (col and col in df.columns) else [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            init_len = len(df)
            mask = pd.Series(True, index=df.index)
            for c in cols:
                s = pd.to_numeric(df[c], errors='coerce')
                q1 = s.quantile(0.25)
                q3 = s.quantile(0.75)
                iqr = q3 - q1
                l_b = q1 - 1.5 * iqr
                u_b = q3 + 1.5 * iqr
                mask = mask & ((s >= l_b) & (s <= u_b) | s.isna())
            df = df[mask]
            rows_affected = init_len - len(df)
            summary = f"Removed {rows_affected} outlier row(s) exceeding Tukey IQR boundaries in {len(cols)} column(s)."

        elif action == 'cap_outliers':
            col = params.get('column')
            method = params.get('method', 'iqr')
            cols = [col] if (col and col in df.columns) else [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            capped_count = 0
            for c in cols:
                s = pd.to_numeric(df[c], errors='coerce')
                if method == 'percentile':
                    l_b = float(s.quantile(0.05))
                    u_b = float(s.quantile(0.95))
                else:
                    q1 = float(s.quantile(0.25))
                    q3 = float(s.quantile(0.75))
                    iqr = q3 - q1
                    l_b = float(q1 - 1.5 * iqr)
                    u_b = float(q3 + 1.5 * iqr)
                outliers_mask = (s < l_b) | (s > u_b)
                capped_count += int(outliers_mask.sum())
                df[c] = s.clip(lower=l_b, upper=u_b)
            rows_affected = capped_count
            summary = f"Capped {capped_count} outlier values across {len(cols)} column(s) using {method} bounds."

        elif action == 'rename_column':
            old_name = params.get('old_name')
            new_name = str(params.get('new_name', '')).strip()
            if old_name in df.columns and new_name:
                df = df.rename(columns={old_name: new_name})
                rows_affected = len(df)
                summary = f"Renamed column '{old_name}' to '{new_name}'."

        elif action == 'delete_column':
            col_to_del = params.get('column')
            if col_to_del in df.columns:
                df = df.drop(columns=[col_to_del])
                rows_affected = len(df)
                summary = f"Deleted column '{col_to_del}'."

        elif action == 'add_column':
            new_col = str(params.get('name', 'New_Feature')).strip()
            formula = str(params.get('formula', '')).strip()
            const_val = params.get('constant_value', '')

            if formula:
                tokens = re.split(r'([\+\-\*\/])', formula)
                if len(tokens) == 3:
                    c1, op, c2 = tokens[0].strip(), tokens[1].strip(), tokens[2].strip()
                    v1 = pd.to_numeric(df[c1], errors='coerce') if c1 in df.columns else float(c1)
                    v2 = pd.to_numeric(df[c2], errors='coerce') if c2 in df.columns else float(c2)
                    if op == '+': df[new_col] = v1 + v2
                    elif op == '-': df[new_col] = v1 - v2
                    elif op == '*': df[new_col] = v1 * v2
                    elif op == '/': df[new_col] = v1 / v2.replace(0, np.nan)
                else:
                    df[new_col] = const_val
            else:
                try:
                    val = float(const_val) if '.' in str(const_val) else int(const_val)
                except Exception:
                    val = const_val
                df[new_col] = val
            rows_affected = len(df)
            summary = f"Added new column '{new_col}'."

        elif action == 'convert_type':
            col = params.get('column')
            target_type = params.get('target_type')
            if col in df.columns:
                if target_type == 'numeric':
                    cleaned = df[col].astype(str).str.replace(r'[\$,%€£\s]', '', regex=True)
                    df[col] = pd.to_numeric(cleaned, errors='coerce')
                elif target_type == 'string':
                    df[col] = df[col].astype(str)
                elif target_type == 'datetime':
                    df[col] = pd.to_datetime(df[col], errors='coerce')
                elif target_type == 'boolean':
                    df[col] = df[col].astype(bool)
                rows_affected = len(df)
                summary = f"Converted column '{col}' to data type '{target_type}'."

        elif action == 'reorder_columns':
            new_order = params.get('order', [])
            valid_order = [c for c in new_order if c in df.columns]
            remaining = [c for c in df.columns if c not in valid_order]
            df = df[valid_order + remaining]
            rows_affected = len(df)
            summary = f"Reordered {len(valid_order)} column(s)."

        elif action == 'transform_column':
            col = params.get('column')
            trans = params.get('transformation')
            if col in df.columns:
                if trans == 'uppercase':
                    df[col] = df[col].astype(str).str.upper()
                elif trans == 'lowercase':
                    df[col] = df[col].astype(str).str.lower()
                elif trans == 'trim':
                    df[col] = df[col].astype(str).str.strip()
                elif trans == 'round':
                    dec = int(params.get('decimals', 2))
                    df[col] = pd.to_numeric(df[col], errors='coerce').round(dec)
                rows_affected = len(df)
                summary = f"Applied '{trans}' transformation to column '{col}'."

        elif action == 'edit_cell':
            row_idx = int(params.get('row_index', 0))
            col = params.get('column')
            new_val = params.get('value')
            if 0 <= row_idx < len(df) and col in df.columns:
                if pd.api.types.is_numeric_dtype(df[col]):
                    try:
                        new_val = float(new_val) if '.' in str(new_val) else int(new_val)
                    except (ValueError, TypeError):
                        pass
                df.iat[row_idx, df.columns.get_loc(col)] = new_val
                rows_affected = 1
                summary = f"Edited cell at Row {row_idx + 1}, Column '{col}'."

        return df, summary, rows_affected

    @classmethod
    def export_dataset(cls, df: pd.DataFrame, format: str = 'csv', dataset_name: str = 'dataset') -> tuple:
        """Exports dataset in CSV, Excel XLSX, JSON, or Statistical Summary CSV.
        Returns: (file_bytes, mime_type, filename)"""
        name = os.path.splitext(os.path.basename(dataset_name))[0]
        fmt = str(format).lower().strip()

        if fmt == 'xlsx':
            if not HAS_OPENPYXL:
                raise RuntimeError("openpyxl is not installed for Excel export.")
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = 'Dataset'
            from openpyxl.styles import Font, PatternFill, Alignment
            header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
            header_font = Font(color="FFFFFF", bold=True)
            for c_idx, col_name in enumerate(df.columns, 1):
                cell = ws.cell(row=1, column=c_idx, value=str(col_name))
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal="center")
            for r_idx, row in enumerate(df.itertuples(index=False), 2):
                for c_idx, val in enumerate(row, 1):
                    ws.cell(row=r_idx, column=c_idx, value="" if pd.isna(val) else val)
            buf = io.BytesIO()
            wb.save(buf)
            return buf.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', f"{name}.xlsx"

        elif fmt == 'json':
            json_str = df.to_json(orient='records', indent=2, date_format='iso')
            return json_str.encode('utf-8'), 'application/json; charset=utf-8', f"{name}.json"

        elif fmt == 'stats_csv':
            eda = cls.compute_comprehensive_analysis(df)
            num_stats = eda.get('numerical_stats', {})
            stats_rows = []
            for col, st in num_stats.items():
                stats_rows.append({
                    'Feature': col,
                    'Mean': st['mean'],
                    'Median': st['median'],
                    'Mode': st['mode'],
                    'Std_Dev': st['std'],
                    'Variance': st['variance'],
                    'Min': st['min'],
                    'Max': st['max'],
                    'Range': st['range'],
                    'Q1': st['q1'],
                    'Q3': st['q3'],
                    'IQR': st['iqr'],
                    'Skewness': st['skewness'],
                    'Kurtosis': st['kurtosis'],
                    'Outlier_Count': st['outlier_count'],
                    'Outlier_Rate_Pct': st['outlier_pct']
                })
            stats_df = pd.DataFrame(stats_rows)
            csv_str = stats_df.to_csv(index=False, encoding='utf-8')
            return csv_str.encode('utf-8'), 'text/csv; charset=utf-8', f"{name}_Statistical_Summary.csv"

        else: # Default CSV
            csv_str = df.to_csv(index=False, encoding='utf-8')
            return csv_str.encode('utf-8'), 'text/csv; charset=utf-8', f"{name}.csv"
