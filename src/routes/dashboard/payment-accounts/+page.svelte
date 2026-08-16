<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{
			name: 'paymentMethodId',
			label: 'Payment method',
			type: 'select',
			required: true,
			items: toItems(data.methodOptions)
		},
		{ name: 'accountName', label: 'Account name', required: true },
		{ name: 'accountNumber', label: 'Account number', required: true },
		{ name: 'bankName', label: 'Bank' },
		{ name: 'branch', label: 'Branch' },
		{ name: 'swiftCode', label: 'SWIFT code' },
		{ name: 'currency', label: 'Currency', placeholder: 'ETB' },
		{ name: 'isForDiaspora', label: 'For donors outside Ethiopia', type: 'select', items: yesNo },
		{ name: 'instructions', label: 'Extra instructions', type: 'textarea', rows: 2 },
		{ name: 'isActive', label: 'Shown on the donate page', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'paymentMethodId',
		'accountName',
		'accountNumber',
		'bankName',
		'branch',
		'swiftCode',
		'currency',
		'isForDiaspora',
		'instructions',
		'isActive',
		'sortOrder'
	];

	const columns = [
		indexColumn,
		column('accountName', 'Account name'),
		column('accountNumber', 'Number'),
		column('bankName', 'Bank'),
		column('currency', 'Currency'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit account', keys }),
		deleteColumn(data.deleteForm, 'accountName')
	];
</script>

<ContentPage
	title="Payment accounts"
	description="The account details a donor is shown and asked to transfer to. Card and PayPal credentials are not here — those live in environment variables by design."
	addTitle="Add account"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
