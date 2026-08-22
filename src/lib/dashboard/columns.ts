import { renderComponent } from '$lib/components/ui/data-table/index.js';
import RowSelectCell from './row-select-cell.svelte';
import DataTableSort from '$lib/components/Table/data-table-sort.svelte';
import BigText from '$lib/components/Table/bigText.svelte';
import ImageViewer from '$lib/components/Table/image-viewer.svelte';
import CrudDialog, { type CrudField } from '$lib/components/Table/crud-dialog.svelte';
import CrudDelete from '$lib/components/Table/crud-delete.svelte';

/**
 * Column builders shared by every content page, so a route only has to say
 * which fields it shows rather than repeat the TanStack boilerplate.
 */

/** Running row number, unaffected by sorting. */
export const indexColumn = {
	id: 'index',
	header: '#',
	cell: (info: any) =>
		info.table.getRowModel().rows.findIndex((row: any) => row.id === info.row.id) + 1,
	enableSorting: false
};

const sortHeader =
	(name: string) =>
	({ column }: any) =>
		renderComponent(DataTableSort, { name, onclick: column.getToggleSortingHandler() });

/** A plain, sortable text column. */
export const column = (key: string, name: string) => ({
	accessorKey: key,
	header: sortHeader(name),
	sortable: true
});

/** Long text, truncated with the full value behind a popover. */
export const longColumn = (key: string, name: string) => ({
	accessorKey: key,
	header: name,
	cell: ({ row }: any) => renderComponent(BigText, { text: row.original[key] ?? '' })
});

/** A JSON string-array column, shown as a comma-joined summary. */
export const listColumn = (key: string, name: string) => ({
	accessorKey: key,
	header: name,
	cell: ({ row }: any) =>
		renderComponent(BigText, { text: (row.original[key] ?? []).join(', ') || '-' })
});

/** Thumbnail that opens the full image. */
export const imageColumn = (key = 'image', name = 'Image') => ({
	accessorKey: key,
	header: name,
	enableSorting: false,
	cell: ({ row }: any) => renderComponent(ImageViewer, { src: row.original[key] ?? '', alt: name })
});

interface RowActionOptions {
	/** The edit form from the page load. */
	data: any;
	fields: CrudField[];
	title: string;
	/** Columns to copy from the row into the form. */
	keys: string[];
	/** File fields whose stored value should preview in the dialog. */
	fileKeys?: string[];
	/** Fields stored as JSON arrays, edited as one value per line. */
	listKeys?: string[];
}

/** The trailing "Edit" column, wired to the shared dialog. */
export const editColumn = ({
	data,
	fields,
	title,
	keys,
	fileKeys = [],
	listKeys = []
}: RowActionOptions) => ({
	id: 'edit',
	header: 'Edit',
	enableSorting: false,
	cell: ({ row }: any) => {
		const values: Record<string, any> = { id: row.original.id };
		for (const key of keys) {
			const value = row.original[key];
			if (listKeys.includes(key)) {
				// JSON arrays are edited as one value per line.
				values[key] = ((value ?? []) as string[]).join('\n');
			} else if (key.endsWith('Id') && value != null) {
				// Foreign keys drive a Select, which binds strings.
				values[key] = String(value);
			} else {
				values[key] = value ?? '';
			}
		}

		const existing: Record<string, string> = {};
		for (const key of fileKeys) existing[key] = row.original[key] ?? '';

		return renderComponent(CrudDialog, {
			title,
			data,
			action: '?/edit',
			fields,
			values,
			existing,
			iconOnly: true
		});
	}
});

/** The trailing "Delete" column, wired to the shared confirmation dialog. */
export const deleteColumn = (data: any, nameKey = 'name') => ({
	id: 'delete',
	header: 'Delete',
	enableSorting: false,
	cell: ({ row }: any) =>
		renderComponent(CrudDelete, {
			data,
			id: row.original.id,
			name: row.original[nameKey] ?? ''
		})
});

/**
 * A selection column, for the screens that offer an action on many rows.
 *
 * Kept out of `indexColumn` and opted into per screen: ticking boxes only
 * earns its space where something can then be done with the selection.
 */
export const selectColumn = {
	id: 'select',
	header: ({ table }: any) =>
		renderComponent(RowSelectCell, {
			checked: table.getIsAllPageRowsSelected(),
			indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
			label: 'Select every row on this page',
			onCheckedChange: (value: boolean) => table.toggleAllPageRowsSelected(value)
		}),
	cell: ({ row }: any) =>
		renderComponent(RowSelectCell, {
			checked: row.getIsSelected(),
			label: 'Select this row',
			onCheckedChange: (value: boolean) => row.toggleSelected(value)
		}),
	enableSorting: false
};
