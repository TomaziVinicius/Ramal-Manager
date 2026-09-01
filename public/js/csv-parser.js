/**
 * Parser CSV robusto compatível com RFC 4180.
 * Suporta aspas, quebras de linha dentro de campos, detecção automática de separador e BOM UTF-8.
 */
const CsvParser = (function() {
    function stripBOM(text) {
        if (text.charCodeAt(0) === 0xFEFF) {
            return text.slice(1);
        }
        return text;
    }

    function detectSeparator(text) {
        text = stripBOM(text);
        const lines = text.split(/\r?\n/).slice(0, 5);
        if (lines.length === 0) return ';';

        const candidates = [',', ';', '\t'];
        const counts = candidates.map(sep => {
            return {
                separator: sep,
                count: (lines[0].match(new RegExp(`\\${sep}`, 'g')) || []).length
            };
        });

        counts.sort((a, b) => b.count - a.count);
        if (counts[0].count === 0) {
            return ';';
        }
        return counts[0].separator;
    }

    function parse(text, options = {}) {
        text = stripBOM(text);
        const separator = options.separator || detectSeparator(text);
        const hasHeader = options.hasHeader !== false;

        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        currentField += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentField += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === separator) {
                    currentRow.push(currentField);
                    currentField = '';
                } else if (char === '\r' && nextChar === '\n') {
                    currentRow.push(currentField);
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                    i++;
                } else if (char === '\n' || char === '\r') {
                    currentRow.push(currentField);
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                } else {
                    currentField += char;
                }
            }
        }

        if (currentField !== '' || currentRow.length > 0) {
            currentRow.push(currentField);
            if (currentRow.length > 1 || currentRow[0].trim() !== '') {
                rows.push(currentRow);
            }
        }

        const validRows = rows.filter(row => row.length > 1 || (row.length === 1 && row[0].trim() !== ''));

        if (validRows.length === 0) {
            return { headers: [], rows: [], separator, rowCount: 0, colCount: 0 };
        }

        let headers = [];
        let dataRows = validRows;

        if (hasHeader) {
            headers = validRows[0].map(h => h.trim());
            dataRows = validRows.slice(1);
        } else {
            headers = validRows[0].map((_, i) => `Coluna ${i + 1}`);
        }

        const structuredRows = dataRows.map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] !== undefined ? row[index] : '';
            });
            return obj;
        });

        return {
            headers,
            rows: structuredRows,
            separator,
            rowCount: structuredRows.length,
            colCount: headers.length
        };
    }

    function generateCsv(headers, rows, separator = ';') {
        const escapeField = (field) => {
            if (field === null || field === undefined) {
                return '';
            }
            let str = String(field);
            const needsQuotes = str.includes(separator) || str.includes('"') || str.includes('\n') || str.includes('\r');
            if (needsQuotes) {
                str = `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const headerLine = headers.map(escapeField).join(separator);
        const dataLines = rows.map(row => {
            return headers.map(header => escapeField(row[header])).join(separator);
        });

        return [headerLine, ...dataLines].join('\r\n');
    }

    return {
        detectSeparator,
        parse,
        generateCsv
    };
})();
