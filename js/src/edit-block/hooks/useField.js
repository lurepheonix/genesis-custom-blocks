/* global gcbEditor */

/**
 * WordPress dependencies
 */
import { useDispatch, useSelect } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import {
	getBlock,
	getBlockNameWithNameSpace,
	getNewFieldNumber,
	getOtherLocation,
	getSettingsDefaults,
	setCorrectOrderForFields,
} from '../helpers';
import { getFieldsAsArray, getFieldsAsObject } from '../../common/helpers';
import { useBlock } from '../hooks';
import { DEFAULT_LOCATION } from '../constants';

/**
 * @typedef {Object} UseFieldReturn The return value of useField.
 * @property {function(string,string|null):string} addNewField Adds a new field.
 * @property {Object} controls All of the controls available.
 * @property {function(SelectedField):void} deleteField Deletes this field.
 * @property {function(SelectedField):void} duplicateField Duplicates this field.
 * @property {function(SelectedField,string):void} changeControl Changes the control of the field.
 * @property {function(SelectedField,Object):void} changeFieldSettings Changes field settings.
 * @property {function(SelectedField):Object} getField Gets the selected field.
 * @property {function(string,string|null):import('../components/editor').Field[]|null} getFieldsForLocation Gets all of the fields for a given location.
 * @property {function(number,number,string,string|null):void} reorderFields Reorders the fields for a given location.
 */

/** @typedef {import('../components/editor').SelectedField|import('../constants').NoFieldSelected} SelectedField The current field */

/**
 * Gets the field context.
 *
 * @return {UseFieldReturn} The field context and functions to change it.
 */
const useField = () => {
	// @ts-ignore
	const { controls } = gcbEditor;
	const { changeBlock } = useBlock();
	const editedPostContent = useSelect(
		( select ) => select( 'core/editor' ).getEditedPostContent(),
		[]
	);

	const fullBlock = getBlock( editedPostContent );
	const { editPost } = useDispatch( 'core/editor' );
	const blockNameWithNameSpace = getBlockNameWithNameSpace( fullBlock );
	const block = fullBlock[ blockNameWithNameSpace ] || {};

	/**
	 * Adds a new field to the end of the existing fields.
	 *
	 * @param {string} location The location to add the field to.
	 * @param {string|null} parentField The parent field to add it to, if any.
	 * @return {string} The name of the new field.
	 */
	const addNewField = ( location, parentField ) => {
		const { fields = {} } = block;
		const hasParent = null !== parentField;
		if ( hasParent && fields[ parentField ] && ! fields[ parentField ].sub_fields ) {
			fields[ parentField ].sub_fields = {};
		}

		const currentFields = hasParent
			? fields[ parentField ].sub_fields
			: fields;
		const newFieldNumber = getNewFieldNumber( currentFields );
		const newFieldName = newFieldNumber
			? `new-field-${ newFieldNumber.toString() }`
			: 'new-field';
		const label = newFieldNumber
			? sprintf(
				// translators: %1$d: the field number
				__( 'New Field %1$d', 'genesis-custom-blocks' ),
				newFieldNumber
			)
			: __( 'New Field', 'genesis-custom-blocks' );

		const newControlName = 'text';
		const newField = {
			...getSettingsDefaults( newControlName, controls ),
			name: newFieldName,
			location,
			label,
			control: newControlName,
			type: 'string',
			order: Object.values( currentFields ).length,
		};

		if ( hasParent ) {
			newField.parent = parentField;
			fields[ parentField ].sub_fields[ newFieldName ] = newField;
		} else {
			fields[ newFieldName ] = newField;
		}

		block.fields = fields;
		fullBlock[ blockNameWithNameSpace ] = block;

		if ( ! block.name ) {
			changeBlock( block );
		} else {
			editPost( { content: JSON.stringify( fullBlock ) } );
		}
		return newFieldName;
	};

	/**
	 * Changes the control of a field.
	 *
	 * @param {SelectedField} fieldToChange The field to change.
	 * @param {string} newControlName The name of the control to change to.
	 */
	const changeControl = ( fieldToChange, newControlName ) => {
		const newControl = controls[ newControlName ];
		if ( ! newControl || ! fieldToChange.name ) {
			return;
		}

		const hasParent = fieldToChange.hasOwnProperty( 'parent' );
		const previousField = hasParent
			? fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.parent ].sub_fields[ fieldToChange.name ]
			: fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.name ];

		const newField = {
			...getSettingsDefaults( newControl.name, controls ),
			name: previousField.name,
			label: previousField.label,
			location: previousField.location,
			order: previousField.order,
			control: newControl.name,
			type: newControl.type,
		};

		if ( hasParent ) {
			newField.parent = fieldToChange.parent;
			fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.parent ].sub_fields[ fieldToChange.name ] = newField;
		} else {
			fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.name ] = newField;
		}

		editPost( { content: JSON.stringify( fullBlock ) } );
	};

	/**
	 * Changes a field name (slug), and returns the fields.
	 *
	 * Each field is accessed in fields with a key of its name.
	 * So renaming a field involves changing that key
	 * and the field's name property.
	 *
	 * @param {Object} fields The fields from which to rename a field.
	 * @param {string} previousName The previous field name (slug).
	 * @param {string} newName The new field name (slug).
	 * @return {Object} The fields with the field renamed.
	 */
	const changeFieldName = ( fields, previousName, newName ) => {
		// If this is a repeater, change the parent property of its sub_fields.
		if ( fields[ previousName ] && fields[ previousName ].hasOwnProperty( 'sub_fields' ) ) {
			fields[ previousName ].sub_fields = getFieldsAsObject(
				Object.values( fields[ previousName ].sub_fields ).map( ( subField ) => {
					return {
						...subField,
						parent: newName,
					};
				} )
			);
		}

		fields[ newName ] = { ...fields[ previousName ], name: newName };
		delete fields[ previousName ];
		return fields;
	};

	/**
	 * Gets the fields for either the editor or inspector.
	 *
	 * @param {string} location The location, like 'editor', or 'inspector'.
	 * @param {string|null} parentField The parent field, if any.
	 * @return {import('../components/editor').Field[]|null} The fields with the given location.
	 */
	const getFieldsForLocation = ( location, parentField = null ) => {
		if ( ! block || ! block.fields ) {
			return null;
		}

		const fields = null === parentField ? block.fields : block.fields[ parentField ].sub_fields;
		if ( ! fields ) {
			return null;
		}

		return getFieldsAsArray( fields ).filter( ( field ) => {
			return location === field.location ||
				( ! field.location && DEFAULT_LOCATION === location );
		} );
	};

	/**
	 * Moves a field to another location, and sets the correct order properties.
	 *
	 * @param {import('../components/editor').Field[]} fields The index of the field to move.
	 * @param {SelectedField} selectedField The field should be moved.
	 * @param {string} newLocation The location to move it to, like 'editor'.
	 */
	const changeFieldLocation = ( fields, selectedField, newLocation ) => {
		const fieldToMove = fields[ selectedField.name ];
		const previousLocation = fieldToMove.location;

		const previousLocationFields = getFieldsForLocation( previousLocation );
		const fieldsWithoutMovedField = previousLocationFields.filter( ( field ) => {
			return field.name !== selectedField.name;
		} );

		const newLocationFields = getFieldsForLocation( newLocation );
		newLocationFields.push( fieldToMove );

		return getFieldsAsObject( [
			...setCorrectOrderForFields( fieldsWithoutMovedField ),
			...setCorrectOrderForFields( newLocationFields ),
		] );
	};

	/**
	 * Changes a field setting.
	 *
	 * @param {SelectedField} fieldToChange The field to change.
	 * @param {Object} newSettings The new settings of the field.
	 */
	const changeFieldSettings = ( fieldToChange, newSettings ) => {
		if ( newSettings.hasOwnProperty( 'location' ) ) {
			fullBlock[ blockNameWithNameSpace ].fields = changeFieldLocation(
				fullBlock[ blockNameWithNameSpace ].fields,
				fieldToChange,
				newSettings.location
			);
		}

		const hasParent = fieldToChange.hasOwnProperty( 'parent' );
		const currentField = hasParent
			? fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.parent ].sub_fields[ fieldToChange.name ]
			: fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.name ];

		const newField = {
			...currentField,
			...newSettings,
		};

		if ( hasParent ) {
			fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.parent ]
				.sub_fields[ fieldToChange.name ] = newField;
		} else {
			fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.name ] = newField;
		}

		if ( newSettings.hasOwnProperty( 'name' ) ) {
			if ( hasParent ) {
				fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.parent ].sub_fields = changeFieldName(
					fullBlock[ blockNameWithNameSpace ].fields[ fieldToChange.parent ].sub_fields,
					fieldToChange.name,
					newSettings.name
				);
			} else {
				fullBlock[ blockNameWithNameSpace ].fields = changeFieldName(
					fullBlock[ blockNameWithNameSpace ].fields,
					fieldToChange.name,
					newSettings.name
				);
			}
		}

		editPost( { content: JSON.stringify( fullBlock ) } );
	};

	/**
	 * Deletes the field.
	 *
	 * @param {SelectedField} selectedField The field to delete.
	 */
	const deleteField = ( selectedField ) => {
		if (
			selectedField.hasOwnProperty( 'parent' ) &&
			fullBlock[ blockNameWithNameSpace ].fields[ selectedField.parent ] &&
			fullBlock[ blockNameWithNameSpace ].fields[ selectedField.parent ].sub_fields
		) {
			delete fullBlock[ blockNameWithNameSpace ].fields[ selectedField.parent ].sub_fields[ selectedField.name ];
		} else {
			delete fullBlock[ blockNameWithNameSpace ].fields[ selectedField.name ];
		}

		editPost( { content: JSON.stringify( fullBlock ) } );
	};

	/**
	 * Gets a field, if it exists.
	 *
	 * @param {SelectedField} field The field to get.
	 * @return {import('../components/editor').Field|{}} The field, or {}.
	 */
	const getField = ( field ) => {
		if ( ! field || ! block.fields ) {
			return {};
		}

		const currentField = field.parent
			? block.fields[ field.parent ].sub_fields[ field.name ]
			: block.fields[ field.name ];

		return currentField || {};
	};

	/**
	 * Duplicates this field.
	 *
	 * @param {SelectedField} selectedField The name of the field to duplicate.
	 */
	const duplicateField = ( selectedField ) => {
		const { fields = {} } = block;
		const currentField = getField( selectedField );
		const hasParent = selectedField.hasOwnProperty( 'parent' );
		const currentFields = hasParent
			? fields[ selectedField.parent ].sub_fields
			: fields;

		const newFieldNumber = getNewFieldNumber( currentFields, selectedField.name );
		const newFieldName = `${ selectedField.name }-${ newFieldNumber.toString() }`;

		currentFields[ newFieldName ] = {
			...currentField,
			name: newFieldName,
			order: Object.values( fields ).length,
		};

		if ( hasParent ) {
			block.fields[ selectedField.parent ].sub_fields = currentFields;
		} else {
			block.fields = currentFields;
		}
		fullBlock[ blockNameWithNameSpace ] = block;

		editPost( { content: JSON.stringify( fullBlock ) } );
	};

	/**
	 * Reorders fields, moving a single field to another position.
	 *
	 * @param {number} moveFrom The index of the field to move.
	 * @param {number} moveTo The index that the field should be moved to.
	 * @param {string} currentLocation The current field's location, like 'editor'.
	 * @param {string|null} parentField The field's parent field, if any.
	 */
	const reorderFields = ( moveFrom, moveTo, currentLocation, parentField = null ) => {
		const fieldsToReorder = getFieldsForLocation( currentLocation, parentField );
		if ( ! fieldsToReorder.length ) {
			return;
		}

		const newFields = [ ...fieldsToReorder ];
		[ newFields[ moveFrom ], newFields[ moveTo ] ] = [ newFields[ moveTo ], newFields[ moveFrom ] ];

		if ( null !== parentField ) {
			fullBlock[ blockNameWithNameSpace ].fields[ parentField ].sub_fields = getFieldsAsObject( [
				...setCorrectOrderForFields( newFields ),
			] );
		} else {
			fullBlock[ blockNameWithNameSpace ].fields = getFieldsAsObject( [
				...setCorrectOrderForFields( newFields ),
				...getFieldsForLocation( getOtherLocation( currentLocation ) ),
			] );
		}

		editPost( { content: JSON.stringify( fullBlock ) } );
	};

	return {
		addNewField,
		changeControl,
		changeFieldSettings,
		controls,
		deleteField,
		duplicateField,
		getField,
		getFieldsForLocation,
		reorderFields,
	};
};

export default useField;
