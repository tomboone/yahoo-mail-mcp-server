/**
 * Pure helper functions extracted from server.js.
 *
 * These have no IMAP or network dependencies, which makes them unit-testable
 * without standing up a connection. server.js delegates to them so there is a
 * single implementation of each.
 */

/**
 * Validate a UIDs array. Returns an error string, or null when valid.
 */
export function validateUIDs(uids) {
    if (!uids) {
        return 'uids is required';
    }

    if (!Array.isArray(uids)) {
        return 'uids must be an array';
    }

    if (uids.length === 0) {
        return 'uids cannot be empty';
    }

    const invalidValues = uids.filter(n =>
        n === undefined ||
        n === null ||
        typeof n !== 'number' ||
        n <= 0 ||
        !Number.isInteger(n)
    );

    if (invalidValues.length > 0) {
        return 'uids contains invalid values (must be positive integers)';
    }

    return null;
}

/**
 * Validate a sequence-numbers array. Returns an error string, or null when valid.
 *
 * Looser than validateUIDs: any number passes, including zero and negatives.
 */
export function validateSequenceNumbers(sequenceNumbers) {
    if (!sequenceNumbers) {
        return 'sequenceNumbers is required';
    }

    if (!Array.isArray(sequenceNumbers)) {
        return 'sequenceNumbers must be an array';
    }

    if (sequenceNumbers.length === 0) {
        return 'sequenceNumbers cannot be empty';
    }

    const invalidValues = sequenceNumbers.filter(n => n === undefined || n === null || typeof n !== 'number');
    if (invalidValues.length > 0) {
        return 'sequenceNumbers contains invalid values (must be numbers)';
    }

    return null;
}

/**
 * Recursively check an IMAP body structure for an attachment disposition.
 */
export function hasAttachments(struct) {
    if (!struct || !Array.isArray(struct)) return false;

    const checkPart = (part) => {
        if (!part) return false;

        if (part.disposition && part.disposition.type === 'attachment') {
            return true;
        }

        if (Array.isArray(part)) {
            return part.some(p => checkPart(p));
        }

        return false;
    };

    return checkPart(struct);
}

/**
 * Flatten node-imap's nested folder tree into a flat list.
 *
 * NOSELECT folders are retained but marked selectable: false.
 */
export function flattenFolders(boxes, parent = null) {
    const result = [];

    for (const [name, box] of Object.entries(boxes)) {
        const fullName = parent ? `${parent}/${name}` : name;

        const isNoSelect = box.attribs && box.attribs.includes('\\Noselect');

        result.push({
            name: fullName,
            delimiter: box.delimiter || '/',
            flags: box.attribs || [],
            selectable: !isNoSelect
        });

        if (box.children) {
            result.push(...flattenFolders(box.children, fullName));
        }
    }

    return result;
}
