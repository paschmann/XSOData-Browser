ï»¿var ODataMetadata = {
    "version": "1.0",
    "dataServices": {
        "maxDataServiceVersion": "3.0",
        "dataServiceVersion": "3.0",
        "schema": [{
            "namespace": "ODataDemo",
            "entityType": [{
                "name": "Product",
                "key": {
                    "propertyRef": [{
                        "name": "ID"
                    }]
                },
                "property": [{
                    "name": "ID",
                    "nullable": "false",
                    "type": "Edm.Int32"
                }, {
                    "name": "Name",
                    "type": "Edm.String",
                    "FC_KeepInContent": "false",
                    "FC_ContentKind": "text",
                    "FC_TargetPath": "SyndicationTitle"
                }, {
                    "name": "Description",
                    "type": "Edm.String",
                    "FC_KeepInContent": "false",
                    "FC_ContentKind": "text",
                    "FC_TargetPath": "SyndicationSummary"
                }, {
                    "name": "ReleaseDate",
                    "nullable": "false",
                    "type": "Edm.DateTime"
                }, {
                    "name": "DiscontinuedDate",
                    "type": "Edm.DateTime"
                }, {
                    "name": "Rating",
                    "nullable": "false",
                    "type": "Edm.Int32"
                }, {
                    "name": "Price",
                    "nullable": "false",
                    "type": "Edm.Decimal"
                }],
                "navigationProperty": [{
                    "name": "Category",
                    "fromRole": "Product_Category",
                    "toRole": "Category_Products",
                    "relationship": "ODataDemo.Product_Category_Category_Products"
                }, {
                    "name": "Supplier",
                    "fromRole": "Product_Supplier",
                    "toRole": "Supplier_Products",
                    "relationship": "ODataDemo.Product_Supplier_Supplier_Products"
                }]
            }, {
                "name": "FeaturedProduct",
                "baseType": "ODataDemo.Product",
                "navigationProperty": [{
                    "name": "Advertisement",
                    "fromRole": "FeaturedProduct_Advertisement",
                    "toRole": "Advertisement_FeaturedProduct",
                    "relationship": "ODataDemo.FeaturedProduct_Advertisement_Advertisement_FeaturedProduct"
                }]
            }, {
                "name": "Advertisement",
                "key": {
                    "propertyRef": [{
                        "name": "ID"
                    }]
                },
                "property": [{
                    "name": "ID",
                    "nullable": "false",
                    "type": "Edm.Guid"
                }, {
                    "name": "Name",
                    "type": "Edm.String"
                }, {
                    "name": "AirDate",
                    "nullable": "false",
                    "type": "Edm.DateTime"
                }],
                "navigationProperty": [{
                    "name": "FeaturedProduct",
                    "fromRole": "Advertisement_FeaturedProduct",
                    "toRole": "FeaturedProduct_Advertisement",
                    "relationship": "ODataDemo.FeaturedProduct_Advertisement_Advertisement_FeaturedProduct"
                }]
            }, {
                "name": "Category",
                "key": {
                    "propertyRef": [{
                        "name": "ID"
                    }]
                },
                "property": [{
                    "name": "ID",
                    "nullable": "false",
                    "type": "Edm.Int32"
                }, {
                    "name": "Name",
                    "type": "Edm.String",
                    "FC_KeepInContent": "true",
                    "FC_ContentKind": "text",
                    "FC_TargetPath": "SyndicationTitle"
                }],
                "navigationProperty": [{
                    "name": "Products",
                    "fromRole": "Category_Products",
                    "toRole": "Product_Category",
                    "relationship": "ODataDemo.Product_Category_Category_Products"
                }]
            }, {
                "name": "Supplier",
                "key": {
                    "propertyRef": [{
                        "name": "ID"
                    }]
                },
                "property": [{
                    "name": "ID",
                    "nullable": "false",
                    "type": "Edm.Int32"
                }, {
                    "name": "Name",
                    "type": "Edm.String",
                    "FC_KeepInContent": "true",
                    "FC_ContentKind": "text",
                    "FC_TargetPath": "SyndicationTitle"
                }, {
                    "name": "Address",
                    "type": "ODataDemo.Address"
                }, {
                    "name": "Location",
                    "type": "Edm.GeographyPoint",
                    "SRID": "Variable"
                }, {
                    "name": "Concurrency",
                    "nullable": "false",
                    "type": "Edm.Int32",
                    "concurrencyMode": "Fixed"
                }],
                "navigationProperty": [{
                    "name": "Products",
                    "fromRole": "Supplier_Products",
                    "toRole": "Product_Supplier",
                    "relationship": "ODataDemo.Product_Supplier_Supplier_Products"
                }]
            }],
            "complexType": [{
                "name": "Address",
                "property": [{
                    "name": "Street",
                    "type": "Edm.String"
                }, {
                    "name": "City",
                    "type": "Edm.String"
                }, {
                    "name": "State",
                    "type": "Edm.String"
                }, {
                    "name": "ZipCode",
                    "type": "Edm.String"
                }, {
                    "name": "Country",
                    "type": "Edm.String"
                }]
            }],
            "association": [{
                "name": "Product_Category_Category_Products",
                "end": [{
                    "type": "ODataDemo.Category",
                    "multiplicity": "0..1",
                    "role": "Category_Products"
                }, {
                    "type": "ODataDemo.Product",
                    "multiplicity": "*",
                    "role": "Product_Category"
                }]
            }, {
                "name": "Product_Supplier_Supplier_Products",
                "end": [{
                    "type": "ODataDemo.Supplier",
                    "multiplicity": "0..1",
                    "role": "Supplier_Products"
                }, {
                    "type": "ODataDemo.Product",
                    "multiplicity": "*",
                    "role": "Product_Supplier"
                }]
            }, {
                "name": "FeaturedProduct_Advertisement_Advertisement_FeaturedProduct",
                "end": [{
                    "type": "ODataDemo.Advertisement",
                    "multiplicity": "0..1",
                    "role": "Advertisement_FeaturedProduct"
                }, {
                    "type": "ODataDemo.FeaturedProduct",
                    "multiplicity": "0..1",
                    "role": "FeaturedProduct_Advertisement"
                }]
            }],
            "entityContainer": [{
                "name": "DemoService",
                "isDefaultEntityContainer": "true",
                "entitySet": [{
                    "name": "Products",
                    "entityType": "ODataDemo.Product"
                }, {
                    "name": "Advertisements",
                    "entityType": "ODataDemo.Advertisement"
                }, {
                    "name": "Categories",
                    "entityType": "ODataDemo.Category"
                }, {
                    "name": "Suppliers",
                    "entityType": "ODataDemo.Supplier"
                }],
                "functionImport": [{
                    "name": "GetProductsByRating",
                    "httpMethod": "GET",
                    "entitySet": "Products",
                    "returnType": "Collection(ODataDemo.Product)",
                    "parameter": [{
                        "name": "rating",
                        "nullable": "false",
                        "type": "Edm.Int32"
                    }]
                }],
                "associationSet": [{
                    "name": "Products_Advertisement_Advertisements",
                    "association": "ODataDemo.FeaturedProduct_Advertisement_Advertisement_FeaturedProduct",
                    "end": [{
                        "role": "FeaturedProduct_Advertisement",
                        "entitySet": "Products"
                    }, {
                        "role": "Advertisement_FeaturedProduct",
                        "entitySet": "Advertisements"
                    }]
                }, {
                    "name": "Products_Category_Categories",
                    "association": "ODataDemo.Product_Category_Category_Products",
                    "end": [{
                        "role": "Product_Category",
                        "entitySet": "Products"
                    }, {
                        "role": "Category_Products",
                        "entitySet": "Categories"
                    }]
                }, {
                    "name": "Products_Supplier_Suppliers",
                    "association": "ODataDemo.Product_Supplier_Supplier_Products",
                    "end": [{
                        "role": "Product_Supplier",
                        "entitySet": "Products"
                    }, {
                        "role": "Supplier_Products",
                        "entitySet": "Suppliers"
                    }]
                }]
            }],
            "annotations": [{
                "target": "ODataDemo.DemoService",
                "valueAnnotation": [{
                    "string": "This is a sample OData service with vocabularies",
                    "term": "Org.OData.Display.V1.Description"
                }]
            }, {
                "target": "ODataDemo.Product",
                "valueAnnotation": [{
                    "string": "All Products available in the online store",
                    "term": "Org.OData.Display.V1.Description"
                }]
            }, {
                "target": "ODataDemo.Product/Name",
                "valueAnnotation": [{
                    "string": "Product Name",
                    "term": "Org.OData.Display.V1.DisplayName"
                }]
            }, {
                "target": "ODataDemo.DemoService/Suppliers",
                "valueAnnotation": [{
                    "string": "Microsoft Corp.",
                    "term": "Org.OData.Publication.V1.PublisherName"
                }, {
                    "string": "MSFT",
                    "term": "Org.OData.Publication.V1.PublisherId"
                }, {
                    "string": "Inventory, Supplier, Advertisers, Sales, Finance",
                    "term": "Org.OData.Publication.V1.Keywords"
                }, {
                    "string": "http://www.odata.org/",
                    "term": "Org.OData.Publication.V1.AttributionUrl"
                }, {
                    "string": "All rights reserved",
                    "term": "Org.OData.Publication.V1.AttributionDescription"
                }, {
                    "string": "http://www.odata.org/",
                    "term": "Org.OData.Publication.V1.DocumentationUrl "
                }, {
                    "string": "All rights reserved",
                    "term": "Org.OData.Publication.V1.TermsOfUseUrl"
                }, {
                    "string": "http://www.odata.org/",
                    "term": "Org.OData.Publication.V1.PrivacyPolicyUrl"
                }, {
                    "string": "4/2/2013",
                    "term": "Org.OData.Publication.V1.LastModified"
                }, {
                    "string": "http://www.odata.org/",
                    "term": "Org.OData.Publication.V1.ImageUrl "
                }]
            }]
        }]
    }
};