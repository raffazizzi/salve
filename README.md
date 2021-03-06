[![Package bagge](https://badge.fury.io/js/salve.svg)](https://badge.fury.io/js/salve)
[![License badge](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![Travis badge](https://travis-ci.org/mangalam-research/salve.svg?branch=master)](https://travis-ci.org/mangalam-research/salve)
[![Greenkeeper badge](https://badges.greenkeeper.io/mangalam-research/salve.svg)](https://greenkeeper.io/)

Introduction
============

Salve (Schema-Aware Library for Validation and Edition) is a TypeScript library
which implements a validator able to validate an XML document on the basis of a
subset of Relax NG (RNG). It is developed as part of the Buddhist Translators
Workbench. It can be seen in action in [wed](https://github.com/mangalam-research/wed).

Salve is used for validating XML with custom Relax NG schemas. We've also
validated files that use the [TEI standard](http://www.tei-c.org/) and the
DocBook v5.0 schema. We want to support as much Relax NG as reasonably possible,
but salve currently has the following limitations:

* XML Schema types ``ENTITY`` and ``ENTITIES`` are treated as a ``string``.

* None of the XML Schema types that deal with time allow the
  parameters ``minInclusive``, ``minExclusive``, ``maxInclusive`` and
  ``maxExclusive``.

* Salve does not verify that numerical values validated as ``float`` or
  ``double`` fit within the limits of ``float`` or ``double``. (This is a common
  limitation of validators. We tested with ``jing`` and ``xmllint --relaxng``
  and found they do not raise errors if, for instance, a validation that expects
  a float is given a value that cannot be represented with a float.)

If someone wishes to use salve but needs support for any of the features that
are missing, they may ask for the feature to be added. Submit an issue on GitHub
for it. If you do submit an issue to add a feature, please make a case for
it. Even better, if someone wishes for a feature to be added, they can
contribute code to salve that will add the feature they want. A solid
contribution is more likely to result in the feature being speedily added to
salve than asking for us to add the feature, and waiting until we have time for
it.

A full validation solution has the following components:

* A tokenizer: responsible for recognizing XML tokens, tag names, tag
  delimiters, attribute names, attribute values, etc.

* A parser: responsible for converting tokens to validation events (see below).

* A well-formedness checker. Please check the [Events](#events) section for more
  information about what this concretely means.

* A validator: responsible for checking that validation events are valid against
  a schema, telling the parser what is possible at the current point in
  validation, and telling the parser what is possible in general (e.g., what
  namespace uris are used in the schema). **This is what salve offers, and only
  this!**

A good example of this division of labor can be found in ``bin/parse.js`` and in
the test suite. In both cases the tokenizer function is performed by ``saxes``,
and the parser function is performed by a parser object that ``saxes`` creates,
customized to call salve's ``Walker.fireEvent()``.

Salve has a sister library named
[salve-dom](https://github.com/mangalam-research/salve-dom) which uses the
parsing facilities available in a browser to provide the tokenizer,
well-formedness and parser components described above.

NOTE: If you are looking at the source tree of salve as cloned from GitHub, know
that executables cannot be executed from ``bin``. They can be executed after a
build, from the ``build/dist/bin`` directory.

If you are looking at the files installed by ``npm`` when you install salve as a
*package*, the files in ``bin`` *are* those you want to execute.

Basic Usage
===========

A typical usage scenario would be as follows:

    // Import the validation module
    const salve = require("salve-annos");

    // Source is a URL to the Relax NG schema to use. A ``file://`` URL
    // may be used to load from the local fs.
    const grammar = salve.convertRNGToPattern(source).pattern;

    // Get a walker on which to fire events.
    const walker = grammar.newWalker();

Then the code that parses the XML file to be validated should call
``fireEvent()`` on ``walker``. Remember to call the ``end()`` method on your
walker at the end of validation to make sure that there are no unclosed tags,
etc.

The file ``bin/parse.js`` (included in salve's source but not in the npm module)
contains an example of a rudimentary parser runnable in Node.js::

    $ node ....../parse.js [rng] [xml to validate]

The ``[rng]`` parameter is the Relax NG schema, recorded in the full XML format
used by Relax NG (not the compact form). The ``[xml to validate]`` parameter is
the XML file to validate against the schema.

Converting Schemas
==================

As you can see above, a Relax NG schema, stored in XML, needs to be converted to
salve's internal format before salve can use it. Internally this happens:

* The XML file recording the Relax NG schema is converted to a tree of objects
  representing the XML.

* The XML tree is validated against the Relax NG schema.

* The XML tree is simplified as described in the Relax NG specification.

* Constraints specified by the Relax NG specification are checked.

* The XML tree is converted to a "pattern", which is a structure internal to
  salve.

The simplest usage is like this::

    const result = salve.convertRNGToPattern(source);

By default the conversion returns an object with a grammar stored on the
``pattern`` field, may reveal some simplification warnings on the ``warnings``
field, and provides a the simplified schema as an XML tree on the ``simplified``
field. In trivial use-case scenarios, only ``pattern`` and ``warnings`` are
used.

In some cases, the code using ``convertRNGToPattern`` may want to serialize the
result of simplification for future use. To do this, it should use
``writeTreeToJSON`` and pass the value of the ``simplified`` field to serialize
the simplified XML tree to JSON. The serialized JSON may then be read with
``readTreeFromJSON`` to create a structure identical to the original
``pattern``. Consider the following code::

    const result = salve.convertRNGToPattern(source);
    const json = salve.writeTreeToJSON(result.simplified);
    const x = salve.readTreeFromJSON(json);

After executing it, ``x`` contains a pattern which represents the same Relax NG
schema as ``result.pattern``.

Do note that that ``writeTreeToJSON`` takes **an XML tree** and produces JSON,
whereas ``readTreeFromJSON`` reads a JSON and produces **a pattern** rather than
an XML tree. There is currently no use-case scenario that requires the two
functions to mirror one-another.

Optionally, you may pass an options object as the 2nd argument of
``convertRNGToPattern`` with ``createManifest`` set to ``true``. If you do this,
then you also get a ``manifest`` field which is an array of objects containing
file paths and their corresponding hashes. Manifests are useful to allow systems
that use salve to know whether a pattern needs to be regenerated with
``convertRNGToPattern``. This is necessary if the system allows a schema to
change after use. Consider the following scenario. Alice uses an XML editor that
uses salve to perform on the fly validation.

1. Alice edits the file ``foo.xml`` with the schema ``foo.rng``. It so happens
   that ``foo.rng`` imports ``math.rng``. The editor will use
   ``convertRNGToPattern`` to convert ``foo.rng`` and ``math.rng`` into the
   format salve needs. It also uses ``writeTreeToJSON`` to cache the
   result. Alice sees a brief progress indicator while the editor converts the
   schema.

2. Over the span of a week, Alice continues editing ``foo.xml``. Each time she
   opens the editor, the editor uses ``readTreeFromJSON`` to load the tree from
   cache instead of using ``convertRNGToPattern`` over and over. As far as Alice
   is concerned, the editor starts immediately. There's no progress indicator
   needed because ``readTreeFromJSON`` is super fast.

3. Alice then changes ``math.rng`` to add new elements. When Alice starts the
   XML editor to edit ``foo.xml`` again, the XML editor must be able to detect
   that the schema needs to go through ``convertRNGToPattern`` *again* because
   ``math.rng`` has changed.

The manifest is used to support the scenario above. If the XML editor stores the
converted schema, and the manifest into its cache, then it can detect if and
when it needs to convert the schema anew.

Security note: It is up to you to decide what strength hash you need. **The
manifest is not designed for the sake of providing security.** So its hashes are
not designed to detect willful tampering but rather to quickly determine whether
a schema was edited. In the vast majority of real world usage scenarios, using a
stronger hash would not provide better security because if an attacker can
replace a schema with their own file, they also can access the manifest and
replace the hash in the manifest.

Events
======

Salve expects that the events it receives are those that would be emitted when
validating a **well-formed document**. That is, passing to salve the events
emitted from a document that is malformed will cause salve to behave in an
undefined manner. (It may crash. It may generate misleading errors. It may not
report any errors.) This situation is due to the fact that salve is currently
developed in a context where the documents it validates cannot be malformed
(because they are represented as DOM trees). So salve contains no functionality
to handle problems with well-formedness. Salve **can be used on malformed
documents**, provided you take care of reporting malformedness issues yourself
and strategize how you will pass events to salve.

Multiple strategies are possible for using salve in a context where
well-formedness is not guaranteed. There is no one-size-fits-all solution
here. A primitive parser could abort as soon as evidence surfaces that the
document is malformed. A more sophisticated parser could process the problematic
structure so as to generate an error but give salve something well-formed. For
instance if parsing ``<foo></baz>``, such parser could emit an error on
encountering ``</baz>`` and replace the event that would be emitted for
``</baz>`` with the event that would be emitted for ``</foo>``, and salve will
happily validate it. The user will still get the error produced by the parser,
and the parser will still be able to continue validating the document with
salve.

The parser is responsible for calling ``fireEvent()`` on the walker returned by
the tree created from the RNG. (See above.) The events currently supported by
``fireEvent()`` are defined below:

``"enterStartTag", [uri, local-name]``
  Emitted when encountering the beginning of a start tag (the string "<tag",
  where "tag" is the applicable tag name) or the equivalent. The qualified
  name should be resolved to its uri and local-name components.

``"leaveStartTag", []``
  Emitted when encountering the end of a start tag (the string ">") or
  equivalent.

``"endTag", [uri, local-name]``
  Emitted when encountering an end tag.

``"attributeName", [uri, local-name]``
  Emitted when encountering an attribute name.

``"attributeValue", [value]``
  Emitted when encountering an attribute value

``"text", [value]``
  Emitted when encountering text. This event must be fired for all instances
  of text, **including white space.** Moreover, salve requires that you fire
  one ``text`` event per consecutive sequence of text. For instance, if you
  have the text ``foo bar`` you may not fire one event for ``foo `` and
  another for ``bar``. Or if you have a sequence of lines, you may not fire one
  event per line. You have to concatenate the lines and fire a single ``text``
  event.

  Do not generate ``text`` events with an empty string as the
  value. (Conversely, a valid document **must** have an ``attributeValue`` for
  all attributes, even those that have empty text as a value.)

Salve support a couple of compact events that serve to pass as one event data
that would normally be passed as multiple events:

``"attributeNameAndValue", [uri, local-name, value]``
  Combines the ``attributeName`` and ``attributeValue`` events into one event.

``"startTagAndAttributes", [uri, local-name, [attribute-data...]]``
  Combines the ``enterStartTag``, ``attributeNameAndValue`` and
  ``leaveStartTag`` events. The ``attribute-data`` part of the event must be a
  sequence of ``uri, local-name, value`` as would be passed to with
  ``attributeNameAndValue``.

  For instance if an element named ``foo`` has the attribute ``a`` with the
  value ``valA``, the event would be: ``"startTagAndAttributes", "", foo,
  "", "a", "valA"``.

.. note:: The compact events do not allow salve to be very precise with
          reporting errors. It is recommended to use them only when optimizing
          for speed, at the expense of precision.

.. note:: When reporting possible events, salve *never* returns compact events
          in the list.

The reason for the set of events supported is that salve is designed to handle
**not only** XML modeled as a DOM tree but also XML parsed as a text string
being dynamically edited. The best and closest example of this would be what
``nxml-mode`` does in Emacs. If the user starts a new document and types only
the following into their editing buffer::

    <html

then what the parser has seen by the time it gets to the end of the buffer is an
``enterStartTag`` event with an empty uri and the local-name "html". The parser
will not see a ``leaveStartTag`` event until the user enters the greater-than
symbol ending the start tag.

You must call ``enterContext()`` or ``enterContextWithMapping`` each time you
encounter a start tag that defines namespaces and call ``leaveContext()`` when
you encounter its corresponding end tag. You must also call
``definePrefix(...)`` for each prefix defined by the element. Example::

    <p xmlns="q" xmlns:foo="foons">...

would require calling::

    enterContext()
    definePrefix("", "q")
    definePrefix("foo", "foons")

Presumably, after the above, your code would call ``resolveName("p")`` on your
walker to determine what namespace ``p`` is in, which would yield the result
``"q"``. And then it would fire the ``enterStartTag`` event with ``q`` as the
namespace and ``p`` as the local name of the tag::

    "enterStartTag", ["q", "p"]

Note the order of the events. The new context must start before salve sees the
``enterStartTag`` event because the way namespaces work, a start tag can declare
its own namespace. So by the time ``enterStartTag`` is issued, salve must know
what namespaces are declared by the tag. If the events were not issued this way,
then the start tag ``p`` in the example would be interpreted to be in the
default namespace in effect **before** it started, which could be other than
``q``. Similarly, ``leaveContext`` must be issued after the corresponding
``endTag`` event.

**Note on performance:** if you already have a simple JavaScript object that
maps prefixes to URIs it is better to call ``enterContextWithMapping`` and pass
your object to this method. ``enterContextWithMapping`` enters a new context and
immediately initializes it with the mapping you pass. This is faster than
calling ``enterContext`` and calling ``definePrefix`` a bunch of times.

For the lazy: it is possible to call ``enterContext()`` for each start tag and
``leaveContext()`` for each end tag irrespective of whether or not the start tag
declares new namespaces. The test suite does it this way.  Note, however, that
performance will be affected somewhat because name resolution will have to
potentially search a deeper stack of contexts than would be strictly necessary.

Support for Guided Editing
==========================

Calling the ``possible()`` method on a walker will return the list of valid
``Event`` objects that could be fired on the walker, given what the walker has
seen so far.  If the user is editing a document which contains only the text::

    <html

and hits a function key which makes the editor call ``possible()``, then the
editor can tell the user what attributes would be possible to add to this
element. In editing facilities like ``nxml-mode`` in Emacs this is called
completion. Similarly, once the start tag is ended by adding the greater-than
symbol::

   <html>

and the user again asks for possibilities, calling ``possible()`` will return
the list of ``Event`` objects that could be fired. Note here that it is the
responsibility of the editor to translate what salve returns into something the
user can use. The ``possible()`` function returns only ``Event`` objects.

Editors that would depend on salve for guided editing would most likely need to
use the ``clone()`` method on the walker to record the state of parsing at
strategic points in the document being edited. This is to avoid needless
reparsing. How frequently this should happen depends on the structure of the
editor. The ``clone()`` method and the code it depends on has been optimized
since early versions of salve, but it is possible to call it too often,
resulting in a slower validation speed than could be attained with less
aggressive cloning.

Overbroad Possibilities
-----------------------

``possible()`` may at times report possibilities that allow for a document
structure that is ultimately invalid. This could happen, for instance, where the
Relax NG schema uses ``data`` to specify that the document should contain a
``positiveInteger`` between 1 and 10. The ``possible()`` method will report that
a string matching the regular expression ``/^\+?\d+$/`` is possible, when in
fact the number ``11`` would match the expression but be invalid. The software
that uses salve should be prepared to handle such a situation.

Name Classes
------------

.. note:: The symbol ``ns`` used in this section corresponds to ``uri``
          elsewhere in this document and ``name`` corresponds to ``local-name``
          elsewhere. We find the ``uri``, ``local-name`` pair to be clearer than
          ``ns``, ``name``. Is ``ns`` meant to be a namespace prefix? A URI? Is
          ``name`` a qualified name, a local name, something else? So for the
          purpose of documentation, we use ``uri``, ``local-name`` wherever we
          can. However, the Relax NG specification uses the ``ns``, ``name``
          nomenclature, which salve also follows internally. The name class
          support is designed to be a close representation of what is described
          in the Relax NG specification. Hence the choice of nomenclature in
          this section.

The term "name class" is defined in the Relax NG specification, please refer to
the specification for details.

Support for Relax NG's name classes introduces a few peculiarities in how
possibilities are reported to clients using salve. The three events that accept
names are affected: ``enterStartTag``, ``endTag``, and ``attributeName``. When
salve returns these events as possibilities, their lone parameter is an instance
of ``name_patterns.Base`` class. This object has a ``.match`` method that takes
a namespace and a name and will return ``true`` if the namespace and name match
the pattern, or ``false`` if not.

Client code that wants to provide a sophisticated analysis of what a name class
does could use the ``.toObject()`` method to get a plain JavaScript object from
such an object. The returned object is essentially a syntax tree representing
the name class. Each pattern has a unique structure. The possible patterns are:

* ``Name``, a pattern with fields ``ns`` and ``name`` which respectively record
  the namespace URL and local name that this object matches. (Corresponds to the
  ``<name>`` element in the simplified Relax NG syntax.)

* ``NameChoice``, a pattern with fields ``a`` and ``b`` which are two name
  classes. (Corresponds to a ``<choice>`` element appearing inside a name class
  in the simplified Relax NG syntax.)

* ``NsName``, a pattern with the field ``ns`` which is the namespace that this
  object would match. The object matches any name. It may have an optional
  ``except`` field that contains a name class for patterns that it should not
  match. The lack of ``name`` field distinguishes it from ``Name``.
  (Corresponds to an ``<nsName>`` element in the simplified Relax NG syntax.)

* ``AnyName``, a pattern. It has the ``pattern`` field set to ``AnyName``. We
  use this ``pattern`` field because ``AnyName`` does not require any other
  fields so ``{}`` would be its representation. This representation would too
  easily mask possible coding errors. ``AnyName`` matches any combination of
  namespace and name. May have an optional ``except`` field that contains a name
  class for patterns it should not match. It corresponds to an ``<anyName>``
  element in the simplified Relax NG syntax.

.. note:: We do not use the ``pattern`` field for all patterns above because the
          only reason to do so would be to distinguish ambiguous structures. For
          instance, if Relax NG were to introduce a ``<superName>`` element that
          also needs ``ns`` and ``name`` fields then it would look the same as
          ``<name>`` and we would not be able to distinguish one from the
          other. However, Relax NG is stable. In the unlikely event a new
          version of Relax NG is released, we'll cross whatever bridge needs to
          be crossed.

Note that the ``<except>`` element from Relax NG does not have a corresponding
object because the presence of ``<except>`` in a name class is recorded in the
``except`` field of the patterns above.

Here are a couple of examples. The name class for::

    element (foo | bar | foo:foo) { ... }

would be recorded as (after partial beautification)::

    {
        a: {
            a: {ns: "", name: "foo"},
            b: {ns: "", name: "bar"}
        },
        b: {ns: "foo:foo", name: "foo"}
    }

The name class for::

    element * - (foo:* - foo:a) { ... }

would be recorded as (after partial beautification)::

    {
        pattern: "AnyName",
        except: {
            ns: "foo:foo",
            except: {ns: "foo:foo", name: "a"}
        }
    }

Clients may want to call the ``.simple()`` method on a name pattern to determine
whether it is simple or not. A pattern is deemed "simple" if it is composed only
of ``Name`` and ``NameChoice`` objects. Such a pattern could be presented to a
user as a finite list of possibilities. Otherwise, if the pattern is not simple,
then either the number of choices is unbounded or it not a discrete list of
items. In such a case, the client code may instead present to the user a field
in which to enter the name of the element or attribute to be created and
validate the name against the pattern. The method ``.toArray()`` can be used to
reduce a pattern which is simple to an array of ``Name`` objects.

Event Asymmetry
---------------

**Note that the events returned by ``possible()`` are *not identical* to the
events that ``fireEvent()`` expects.** While most events returned are exactly
those that would be passed to ``fireEvent()``, there are three exceptions: the
``enterStartTag``, ``endTag`` and ``attributeName`` events returned by
``possible()`` will have a single parameter after the event name which is an
object of ``name_patterns.Base`` class. However, when passing a corresponding
event to ``fireEvent()``, the same events take two string parameters after the
event name: a namespace URL and a local name. To spell it out, they are of this
form::

    event_name, [uri, local-name]

where ``event_name`` is the string which is the name of the event to fire,
``uri`` is the namespace URI and ``local-name`` is the local name of the element
or attribute.

Error Messages
--------------

Error messages that report attribute or element names use the
``name_patterns.Name`` class to record names, even in cases where
``patterns.EName`` would do. This is for consistency purposes, because some
error messages **must** use ``name_patterns`` objects to report their
errors. Rather than have some error messages use ``EName`` and some use the
object in ``name_patterns`` they all use the objects in ``name_patterns``, with
the simple cases using ``name_patterns.Name``.

In most cases, in order to present the end user of your application with error
messages that make sense *to the user*, you will need to process error
messages. This is because error messages generated by salve provide in the error
object ``(ns, local name)`` pairs. A user would most likely like to see a
namespace prefix rather than URI (``ns``). However, since namespace prefixes are
a matter of user preference, and there may be many ways to decide how to
associate a namespace prefix with a URI, salve does not take a position in this
matter and lets the application that uses it decide how it wants to present URIs
to users. The application also has to determine what strategy to use to present
complex (i.e., non-simple) name patterns to the user. Again, there is no
one-size-fits-all solution.

Misplaced Elements
==================

A problem occurs when validating an XML document that contains an unexpected
element. In such case, salve will issue an error but then what should it do with
the contents of the misplaced element? Salve handles this in two ways:

1. If the unexpected element is known in the schema and has only one definition,
   then salve will assume that the user meant to use the element defined in the
   schema and will validate it as such.

2. Otherwise, salve will turn off validation until the element is closed.

Consider the following case::

    <p>Here we have a <name><first>John</first><last>Doe</last></name>
    because the <emph>person's name</emph> is not known.</p>

If ``name`` cannot appear in ``p`` but ``name`` has only one definition in the
schema, then salve will emit an error upon encountering the ``enterStartTag``
event for ``name``, and then validate ``name`` as if it had been found in a
valid place. If it turns out that the schema defines one ``name`` element which
can appear inside a ``person`` element and another ``name`` element which can
appear inside a ``location`` element (which would be possible with Relax NG),
then salve will emit an error but won't perform any validation inside
``name``. Validation will resume after the ``endTag`` event for
``name``. (Future versions of salve may implement logic to figure out ambiguous
cases such as this one.) This latter scenario also occurs if ``name`` is not
defined at all by the schema.

Documentation
=============

The code is documented using ``typedoc``. The following command will generate
the documentation::

    $ gulp doc

You may need to create a ``gulp.local`` module to tell ``gulp`` where to get
``rst2html``. (Defaults are such that ``gulp`` will use your ``PATH`` to locate
such tools.) The formatted documentation will appear in the ``build/api/``
subdirectory, and the ``README.html`` in the root of the source tree.

**NOTE**: All the public interfaces of salve are available through the
``validate`` module. However, ``validate`` is a facade that exposes interfaces
that are implemented in separate modules like ``patterns`` and ``formats``.

Dependencies
============

In Node
-------

Whenever you call on salve's functionalities to read a Relax NG schema, the
``fetch`` function must be available in the global space for salve to use. On
Node, this means you must load a polyfill to provide this function.

Running salve's tests **additionally** requires that the development
dependencies be installed. Please see the ``package.json`` file for details
regarding these dependencies. Note that ``gulp`` should be installed so that its
executable is in your path.  Either this, or you will have to execute
``./node_modules/.bin/gulp``

If you want to contribute to salve, your code will have to pass the checks
listed in ``.glerbl/repo_conf.py``. So you either have to install glerbl to get
those checks done for you or run the checks through other means. See
[Contributing](#contributing).

In The Browser
--------------

The following lists the most prominent cases. It is not practical for us to keep
track of every single feature that old browsers like IE11 don't support.

* ``fetch`` must be present.

* ``Promise`` must be present.

* ``Object.assign`` must be present.

* ``URL`` must be present.

* ``Symbol`` [and ``Symbol.iterator``] must be present.

* The String methods introduced by ES6 (``includes``, ``endsWith``, etc.)

* ``Array.prototype.includes``

* Old ``Set`` and ``Map`` implementations like those in IE11 are either broken
  or incomplete.

On old browsers, we recommend using ``core-js`` to take care of many of these in
one fell swoop. You'll have to provide polyfills for ``fetch`` and ``URL`` from
other sources.

Note that we do not support old browsers. Notably, salve won't run on any
version of IE.

Build System
============

Salve uses gulp. Salve's build setup gets the values for its configuration
variables from three sources:

* Internal default values.

* From an optional ``gulp.local.js`` module that can override the
  internal defaults.

* From command line options that can override everything above.

The variables that can be set are:

+-----------------------+------------------------------------------------------+
|Name                   | Meaning                                              |
+=======================+======================================================+
|``doc_private``        | Whether to produce documentation for private         |
|                       | entities. You can set ``doc_private`` to ``false``   |
|                       | using ``no_doc_private``.                            |
+-----------------------+------------------------------------------------------+
|``mocha_grep``         | ``--grep`` parameter for Mocha                       |
+-----------------------+------------------------------------------------------+
|``rst2html``           | ``rst2html`` command to run                          |
+-----------------------+------------------------------------------------------+

Note that when used on the command line, underscores become dashes, thus
``--mocha-grep`` and ``--doc-private``.

The ``gulp.local.js`` file is a module. You must export values
like this::

    exports.doc_private = true

Building
========

Run::

    $ gulp

This will create a ``build/dist/`` subdirectory in which the JavaScript
necessary to validate XML files against a prepared Relax NG schema. You could
copy what is in ``build/dist>`` to a server to serve these files to a client
that would then perform validation.

Deploying
=========

When you install salve through `npm`, you get a package that contains:

* a hierarchy of CommonJS modules in `lib`,
* a minified UMD build as `salve.min.js`.

The UMD build can be loaded in a CommonJS environment, in a AMD environment or
as "plain scripts" in a browser. If you use the latter, then salve will be
accessible as the `salve` global.

Testing
=======

Running the following command from the root of salve will run the tests::

    $ gulp test

Running ``mocha`` directly also works, but this may run the test against stale
code, whereas ``gulp test`` always runs a build first.

Contributing
============

Contributions must pass the commit checks turned on in
``glerbl/repo_conf.py``. Use ``glerbl install`` to install the hooks. Glerbl
itself can be found at https://github.com/lddubeau/glerbl. It will eventually
make its way to the Python package repository so that ``pip install glerbl``
will work.

Schema File Format
==================

``writeTreeToJSON`` converts a Relax NG file formatted in XML into a more
compact format used by salve at validation time. Salve supports version 3 of
this file format. Versions 0 to 2 are now obsolete. The structure is::

    {"v":<version>,"o":<options>,"d":[...]}

The ``v`` field gives the version number of the data. The ``o`` field is a bit
field of options indicating how the file was created. Right now the only thing
it records is whether or not element paths are present in the generated
file. The ``d`` field contains the actual schema. Each item in it is of the
form::

   [<array type>, ...]

The first element, ``<array type>``, determines how to interpret the array. The
array type could indicate that the array should be interpreted as an actual
array or that it should be interpreted as an object of type ``Group`` or
``Choice``, etc. If it is an array, then ``<array type>`` is discarded and the
rest of the array is the converted array. If it is another type of object then
again the ``<array type>`` is discarded and an object is created with the rest
of the array as its constructor's parameters. All the array's elements after
``<array type>`` can be JSON primitive types, or arrays to be interpreted as
actual arrays or as objects as described above.

License
=======

Original Code
-------------

Code completely original to salve is released under the [Mozilla Public License
version 2.0](http://www.mozilla.org/MPL/2.0/). Copyright 2013-2016 Mangalam
Research Center for Buddhist Languages, Berkeley, CA.

RNG Simplification Code
-----------------------

The RNG simplification files coded in XSL were adapted from [Nicolas Debeissat's
code](https://github.com/ndebeiss/jsrelaxngvalidator/commit/8d353c73880ff519b31193905638cc97a93d1fad). These
files were originally released under the [CeCILL
license](http://www.cecill.info/index.en.html). Nicolas in [March
2016](https://github.com/ndebeiss/jsrelaxngvalidator/commit/f7336b2472baec60ab16571b865447e1146196ab)
then changed the license to the Apache License 2.0.

In the version of these files bundled with salve, multiple bugs have been
corrected, some minor and some major, and some changes have been made for
salve's own internal purposes. For the sake of simplicity, these changes are
also covered by the original licenses that apply to Nicolas' code.

Credits
=======

Salve is designed and developed by Louis-Dominique Dubeau, Director of
Software Development for the Buddhist Translators Workbench project,
Mangalam Research Center for Buddhist Languages.

Jesse Bethel has contributed to salve's documentation, and migrated salve's
build system from Make to Grunt.

[![Mangalam Research Logo](https://secure.gravatar.com/avatar/7fc4e7a64d9f789a90057e7737e39b2a)](http://www.mangalamresearch.org/)

This software has been made possible in part by a Level I Digital Humanities
Start-up Grant and a Level II Digital Humanities Start-up Grant from the
National Endowment for the Humanities (grant numbers HD-51383-11 and
HD-51772-13). Any views, findings, conclusions, or recommendations expressed in
this software do not necessarily represent those of the National Endowment for
the Humanities.

[![NEH](http://www.neh.gov/files/neh_logo_horizontal_rgb.jpg)](http://www.neh.gov/)

#  LocalWords:  fireEvent js chai semver json xmllint xsltproc npm
#  LocalWords:  RNG minified rng XSLT xsl constructTree newWalker mk
#  LocalWords:  xml enterStartTag uri leaveStartTag endTag nxml html
#  LocalWords:  attributeName attributeValue Debeissat's API
#  LocalWords:  CeCILL tokenizer Makefile README boolean anyName RST
#  LocalWords:  nsName URIs uris enterContext leaveContext xmlns rst
#  LocalWords:  definePrefix useNameResolver foons resolveName HD NG
#  LocalWords:  args param TEI glerbl Github reStructuredText readme
#  LocalWords:  validator namespace RequireJS subdirectory DOM cli
#  LocalWords:  Dubeau Mangalam argparse Gruntfile Bethel unclosed
#  LocalWords:  runnable namespaces reparsing amd executables usr lt
#  LocalWords:  deployable schemas LocalWords api dir maxInclusive
#  LocalWords:  minInclusive minExclusive maxExclusive cd abcd jing
#  LocalWords:  github jison NaN baz emph lodash xregexp XRegExp ns
#  LocalWords:  init positiveInteger NCName NameChoice superName
#  LocalWords:  EName
