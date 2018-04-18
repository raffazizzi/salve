/**
 * Pattern and walker for RNG's ``list`` elements.
 * @author Louis-Dominique Dubeau
 * @license MPL 2.0
 * @copyright Mangalam Research Center for Buddhist Languages
 */
import { Datatype, registry } from "../datatypes";
import { ValidationError } from "../errors";
import { HashMap } from "../hashstructs";
import { NameResolver } from "../name_resolver";
import { addWalker, EndResult, Event, EventSet, InternalWalker, makeEventSet,
         Pattern } from "./base";

/**
 * Value pattern.
 */
export class Value extends Pattern {
  readonly datatype: Datatype;
  readonly rawValue: string;
  private _value: any | undefined;

  /**
   * @param xmlPath This is a string which uniquely identifies the
   * element from the simplified RNG tree. Used in debugging.
   *
   * @param value The value expected in the document.
   *
   * @param type The type of value. ``undefined`` means
   * ``"token"``.
   *
   * @param datatypeLibrary The URI of the datatype library to
   * use. ``undefined`` means use the builtin library.
   *
   * @param ns The namespace in which to interpret the value.
   */
  // tslint:disable-next-line: no-reserved-keywords
  constructor(xmlPath: string, value: string, readonly type: string = "token",
              readonly datatypeLibrary: string = "", readonly ns: string = "") {
    super(xmlPath);
    this.datatype = registry.get(this.datatypeLibrary).types[this.type];
    if (this.datatype === undefined) {
      throw new Error(`unknown type: ${type}`);
    }
    this.rawValue = value;
  }

  get value(): any {
    let ret: any = this._value;
    if (ret != null) {
      return ret;
    }

    // We construct a pseudo-context representing the context in the schema
    // file.
    let context: { resolver: NameResolver } | undefined;
    if (this.datatype.needsContext) {
      const nr: NameResolver = new NameResolver();
      nr.definePrefix("", this.ns);
      context = { resolver: nr };
    }
    ret = this._value = this.datatype.parseValue(this.xmlPath,
                                                 this.rawValue, context);

    return ret;
  }

  hasEmptyPattern(): boolean {
    return this.rawValue === "";
  }
}

/**
 * Walker for [[Value]].
 */
class ValueWalker extends InternalWalker<Value> {
  private matched: boolean;
  private readonly context: { resolver: NameResolver } | undefined;
  private readonly nameResolver: NameResolver;
  canEnd: boolean;
  canEndAttribute: boolean;

  protected constructor(other: ValueWalker, memo: HashMap);
  protected constructor(el: Value, nameResolver: NameResolver);
  protected constructor(elOrWalker: Value |  ValueWalker,
                        nameResolverOrMemo: HashMap | NameResolver) {
    if ((elOrWalker as Value).newWalker !== undefined) {
      const el = elOrWalker as Value;
      const nameResolver = nameResolverOrMemo as NameResolver;
      super(el);
      this.nameResolver = nameResolver;
      this.context = el.datatype.needsContext ?
        { resolver: this.nameResolver } : undefined;
      this.matched = false;
      this.canEndAttribute = this.canEnd = this.el.hasEmptyPattern();
    }
    else {
      const walker = elOrWalker as ValueWalker;
      const memo = nameResolverOrMemo as HashMap;
      super(walker, memo);
      this.nameResolver = this._cloneIfNeeded(walker.nameResolver, memo);
      this.context = walker.context !== undefined ?
        { resolver: this.nameResolver } : undefined;
      this.matched = walker.matched;
      this.canEnd = walker.canEnd;
      this.canEndAttribute = walker.canEndAttribute;
    }
  }

  _possible(): EventSet {
    if (this.possibleCached === undefined) {
      this.possibleCached = this.matched ? makeEventSet() :
        makeEventSet(new Event("text", this.el.rawValue));
    }

    return this.possibleCached;
  }

  fireEvent(name: string, params: string[]): false | undefined {
    if (this.matched || name !== "text" ||
       !this.el.datatype.equal(params[0], this.el.value, this.context)) {
      return undefined;
    }

    this.matched = true;
    this.canEndAttribute = this.canEnd = true;
    this.possibleCached = undefined;

    return false;
  }

  end(attribute: boolean = false): EndResult {
    return this.canEnd ? false :
      [new ValidationError(`value required: ${this.el.rawValue}`)];
  }

  _suppressAttributes(): void {
    // No child attributes.
  }
}

addWalker(Value, ValueWalker);

//  LocalWords:  RNG's MPL RNG nd possibleCached
