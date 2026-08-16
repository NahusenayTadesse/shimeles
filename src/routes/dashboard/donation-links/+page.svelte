<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import {
		column,
		deleteColumn,
		editColumn,
		indexColumn,
		longColumn
	} from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import PaypalIdCell from '$lib/dashboard/paypal-id-cell.svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { yesNo } from '$lib/dashboard/options';
	import { CircleAlert } from '@lucide/svelte';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const audiences = [
		{ value: 'anyone', name: 'Anyone' },
		{ value: 'diaspora', name: 'Donors outside Ethiopia' },
		{ value: 'local', name: 'Donors inside Ethiopia' }
	];

	const fields: CrudField[] = [
		{ name: 'name', label: 'Name of the appeal', required: true, placeholder: 'Give with PayPal' },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'paypal-general' },
		{ name: 'companyName', label: 'Platform', required: true, placeholder: 'PayPal' },
		{
			name: 'url',
			label: 'Link from the platform',
			required: true,
			placeholder: 'https://www.paypal.com/donate?campaign_id=XXXXXXXX'
		},
		{
			name: 'isPaypal',
			label: 'This is a PayPal link — show a PayPal donate button',
			type: 'select',
			items: yesNo
		},
		{ name: 'description', label: 'What this is', type: 'textarea', rows: 2 },
		{ name: 'buttonLabel', label: 'Button text', placeholder: 'Donate with PayPal' },
		{ name: 'note', label: 'Small print under the button', type: 'textarea', rows: 2 },
		{
			name: 'companyLogo',
			label: 'Platform logo URL',
			placeholder: 'https://… (leave blank to show the platform name instead)'
		},
		{ name: 'audience', label: 'Best suited to', type: 'select', items: audiences },
		{ name: 'currency', label: 'Currency', placeholder: 'USD' },
		{ name: 'isFeatured', label: 'Highlight this one', type: 'select', items: yesNo },
		{ name: 'isActive', label: 'Shown on the donate page', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'name',
		'slug',
		'companyName',
		'url',
		'isPaypal',
		'description',
		'buttonLabel',
		'note',
		'companyLogo',
		'audience',
		'currency',
		'isFeatured',
		'isActive',
		'sortOrder'
	];

	const columns = [
		indexColumn,
		column('companyName', 'Platform'),
		column('name', 'Appeal'),
		{
			id: 'campaignId',
			header: 'Campaign id',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(PaypalIdCell, { url: row.original.url, isPaypal: row.original.isPaypal })
		},
		longColumn('url', 'Link'),
		column('audience', 'Audience'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit donation link', keys }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<div class="flex flex-col gap-4">
	<Alert.Root>
		<CircleAlert class="size-4" />
		<Alert.Title>Gifts given here are not recorded in this system</Alert.Title>
		<Alert.Description>
			The platform collects the money and sends the receipt, so these gifts do not appear in the
			reconciliation queue and are not counted in "funds raised" on the site. Reconcile them from
			PayPal's and Zeffy's own reports.
		</Alert.Description>
	</Alert.Root>

	<ContentPage
		title="Donation links"
		description="Outside payment platforms offered on the Donate page. For PayPal, paste the link they gave you — the campaign id is read out of it and the button is drawn in the site's own style, so there is no HTML to copy."
		addTitle="Add donation link"
		addForm={data.addForm}
		{fields}
		{columns}
		rows={data.rows}
	/>
</div>
